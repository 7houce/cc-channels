import type { ChannelClient } from './interfaces.js'
import type { Allowlist } from './allowlist.js'
import type { MessageQueue } from './message-queue.js'
import type { McpChannelServer } from './mcp-server.js'
import type { Attachment } from './types.js'
import { logger } from './logger.js'

/**
 * Platform-specific text and behaviour knobs for {@link MessagePipeline}.
 *
 * Only the values that genuinely differ between channels live here; the control
 * flow (pairing, allowlist gating, permission replies, enqueue/deliver/retry)
 * is shared.
 */
export interface PipelineConfig {
  /** Prefix that introduces a pairing command, e.g. `"/pair "` or `"pair "`. */
  pairPrefix: string
  /** Exact text that requests a fresh pairing code, e.g. `"/newcode"` or `"newcode"`. */
  newCodeCommand: string
  /** Reaction emoji sent to acknowledge an inbound message. */
  ackReaction: string
  /** Localized response texts. */
  texts: {
    pairSuccess: string
    pairInvalid: string
    /** Builds the reply describing a freshly generated pairing code. */
    newCode: (code: string) => string
    queueFull: string
    deliveryFailed: string
  }
}

/** Result of the channel-specific attachment/content preparation step. */
export interface PreparedPayload {
  /** Final delivered content (text plus any media notes). */
  content: string
  attachments: Attachment[]
  meta: Record<string, string>
}

/**
 * A platform message normalized into the fields the shared pipeline needs.
 * The channel adapter parses the raw platform event into this shape and
 * provides {@link prepare} to download attachments and build the delivery
 * payload — invoked by the pipeline only once the message has passed gating.
 */
export interface InboundMessage {
  chatId: string
  senderId: string
  senderName: string
  messageId: string
  /** Raw text / caption used for command parsing. */
  text: string
  /**
   * Channel-specific step that downloads attachments and assembles the
   * delivery payload. Called after the acknowledgement reaction, mirroring the
   * original per-channel ordering.
   */
  prepare: () => Promise<PreparedPayload>
}

export interface PipelineDeps {
  client: Pick<ChannelClient, 'sendMessage' | 'addReaction'>
  allowlist: Allowlist
  queue: MessageQueue
  mcp: McpChannelServer
}

/**
 * Shared inbound-message processor for all channels.
 *
 * Encapsulates the flow that was previously copy-pasted into each channel's
 * `index.ts`: pairing commands, allowlist gating, permission replies,
 * acknowledgement reaction, enqueue, MCP delivery, and retry-with-backoff.
 *
 * Channel adapters only need to (1) parse the raw platform event into an
 * {@link InboundMessage} and (2) supply a {@link PipelineConfig} with the
 * platform-specific strings.
 */
export class MessagePipeline {
  private readonly client: Pick<ChannelClient, 'sendMessage' | 'addReaction'>
  private readonly allowlist: Allowlist
  private readonly queue: MessageQueue
  private readonly mcp: McpChannelServer
  private readonly config: PipelineConfig

  constructor(deps: PipelineDeps, config: PipelineConfig) {
    this.client = deps.client
    this.allowlist = deps.allowlist
    this.queue = deps.queue
    this.mcp = deps.mcp
    this.config = config
  }

  /** Process a single normalized inbound message. */
  async handle(msg: InboundMessage): Promise<void> {
    const { chatId, senderId, senderName, messageId, text } = msg
    const { pairPrefix, newCodeCommand, ackReaction, texts } = this.config

    // Pairing command bypasses the allowlist.
    if (text.startsWith(pairPrefix)) {
      const code = text.slice(pairPrefix.length).trim()
      if (this.allowlist.validatePairingCode(code)) {
        this.allowlist.addUser(senderId, senderName)
        await this.client.sendMessage(chatId, texts.pairSuccess)
      } else {
        await this.client.sendMessage(chatId, texts.pairInvalid)
      }
      return
    }

    if (text === newCodeCommand) {
      if (!this.allowlist.isAllowed(senderId)) return // silently drop
      const code = this.allowlist.generatePairingCode()
      await this.client.sendMessage(chatId, texts.newCode(code))
      return
    }

    // Allowlist check.
    if (!this.allowlist.isAllowed(senderId)) return // silently drop

    // Route permission requests back to this chat.
    this.mcp.setPermissionChatId(chatId)

    // Permission reply check.
    if (this.mcp.isPermissionReply(text)) {
      await this.mcp.handlePermissionReply(text)
      return
    }

    // Acknowledge and track for follow-up reactions.
    await this.client.addReaction(chatId, messageId, ackReaction)
    this.mcp.trackInboundMessage(chatId, messageId)

    // Channel-specific attachment download + payload assembly.
    const { content, attachments, meta } = await msg.prepare()

    if (!content && attachments.length === 0) return // empty message, skip

    // Enqueue.
    const queued = this.queue.enqueue({
      chatId,
      content: content || '(attachment)',
      senderId,
      messageId,
      attachments: attachments.length > 0 ? attachments : undefined,
    })

    if (!queued) {
      await this.client.sendMessage(chatId, texts.queueFull)
      return
    }

    // Deliver via MCP notification.
    try {
      await this.mcp.sendNotification(queued.content, meta)
      this.queue.markDelivered(queued.id)
    } catch (err) {
      logger.error(`Failed to deliver message ${queued.id}: ${err}`)
      this.retryDelivery(queued.id, meta)
    }
  }

  /** Retry MCP delivery with exponential backoff until the queue gives up. */
  private retryDelivery(queueId: string, meta: Record<string, string>): void {
    const msg = this.queue.get(queueId)
    if (!msg || msg.status === 'failed') return

    this.queue.markRetry(queueId)
    const updatedMsg = this.queue.get(queueId)
    if (!updatedMsg || updatedMsg.status === 'failed') {
      void this.client.sendMessage(msg.chatId, this.config.texts.deliveryFailed)
      return
    }

    const delay = this.queue.getRetryDelay(queueId)
    setTimeout(async () => {
      try {
        await this.mcp.sendNotification(updatedMsg.content, meta)
        this.queue.markDelivered(queueId)
      } catch (err) {
        logger.error(`Retry failed for ${queueId}: ${err}`)
        this.retryDelivery(queueId, meta)
      }
    }, delay)
  }
}
