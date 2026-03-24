#!/usr/bin/env node
import 'dotenv/config'
import * as Lark from '@larksuiteoapi/node-sdk'
import { FeishuClient } from './client.js'
import { FeishuToolProvider } from './tools.js'
import { getUnsupportedType, extractAttachments, extractTextContent } from './helpers.js'
import {
  logger,
  MessageQueue,
  Allowlist,
  AttachmentHandler,
  McpChannelServer,
} from '@cc-channels/core'
import { join } from 'node:path'

// --- Config ---
const APP_ID = process.env.FEISHU_APP_ID
const APP_SECRET = process.env.FEISHU_APP_SECRET
if (!APP_ID || !APP_SECRET) {
  logger.error('FEISHU_APP_ID and FEISHU_APP_SECRET must be set')
  process.exit(1)
}

const PROJECT_DIR = process.env.PROJECT_DIR || process.cwd()
const ALLOWLIST_PATH = join(PROJECT_DIR, 'allowlist.json')

// --- Init modules ---
const client = new FeishuClient(APP_ID, APP_SECRET)
const queue = new MessageQueue()
const allowlist = new Allowlist(ALLOWLIST_PATH)
const attachments = new AttachmentHandler(client, '/tmp/claude-channel-feishu')
const toolProvider = new FeishuToolProvider(client, allowlist)
const mcp = new McpChannelServer(client, toolProvider)
toolProvider.setMcpServer(mcp)

// --- Pairing code on startup ---
const GENERATE_PAIR_CODE = process.env.GENERATE_PAIR_CODE === 'true'
if (!allowlist.hasAnyUsers() || GENERATE_PAIR_CODE) {
  const code = allowlist.generatePairingCode()
  logger.info(`Pairing code: ${code} — send "pair ${code}" in Feishu (expires in 5 min)`)
}

// --- Process inbound message ---
async function handleMessage(
  chatId: string, senderId: string, senderName: string,
  messageId: string, messageType: string, rawContent: any
): Promise<void> {
  const text = extractTextContent(messageType, rawContent)

  // Pair command
  if (text.startsWith('pair ')) {
    const code = text.slice(5).trim()
    if (allowlist.validatePairingCode(code)) {
      allowlist.addUser(senderId, senderName)
      await client.sendMessage(chatId, 'Paired successfully \u2705')
    } else {
      await client.sendMessage(chatId, 'Invalid or expired pairing code')
    }
    return
  }

  if (text === 'newcode') {
    if (!allowlist.isAllowed(senderId)) return
    const code = allowlist.generatePairingCode()
    await client.sendMessage(chatId, `New pairing code: ${code}\nExpires in 5 minutes. Send "pair ${code}" to pair.`)
    return
  }

  // Allowlist check
  if (!allowlist.isAllowed(senderId)) return

  // Set permission chat
  mcp.setPermissionChatId(chatId)

  // Permission reply check
  if (mcp.isPermissionReply(text)) {
    await mcp.handlePermissionReply(text)
    return
  }

  // React "working on it"
  await client.addReaction(chatId, messageId, 'THUMBSUP')
  mcp.trackInboundMessage(chatId, messageId)

  // Unsupported media
  const unsupported = getUnsupportedType(messageType)
  let content = text
  if (unsupported) {
    content = content ? `${content}\n(unsupported attachment: ${unsupported})` : `(unsupported attachment: ${unsupported})`
  }

  // Extract attachments
  const rawAttachments = extractAttachments(messageType, rawContent)
  const meta: Record<string, string> = {
    chat_id: chatId,
    sender: senderName,
    message_id: messageId,
  }

  for (const att of rawAttachments) {
    const localPath = await attachments.download(att, messageId)
    if (localPath) {
      att.localPath = localPath
      meta[att.type === 'photo' ? 'image_path' : 'file_path'] = localPath
      meta[att.type === 'photo' ? 'has_image' : 'has_file'] = 'true'
    }
  }

  if (!content && rawAttachments.length === 0) return

  // Enqueue
  const queued = queue.enqueue({
    chatId,
    content: content || '(attachment)',
    senderId,
    messageId,
    attachments: rawAttachments.length > 0 ? rawAttachments : undefined,
  })

  if (!queued) {
    await client.sendMessage(chatId, 'Queue full, please try again later')
    return
  }

  // Deliver via MCP
  try {
    await mcp.sendNotification(queued.content, meta)
    queue.markDelivered(queued.id)
  } catch (err) {
    logger.error(`Failed to deliver message ${queued.id}: ${err}`)
    retryDelivery(queued.id, meta)
  }
}

function retryDelivery(queueId: string, meta: Record<string, string>): void {
  const msg = queue.get(queueId)
  if (!msg || msg.status === 'failed') return

  queue.markRetry(queueId)
  const updatedMsg = queue.get(queueId)
  if (!updatedMsg || updatedMsg.status === 'failed') {
    void client.sendMessage(msg.chatId, 'Message delivery failed, please retry')
    return
  }

  const delay = queue.getRetryDelay(queueId)
  setTimeout(async () => {
    try {
      await mcp.sendNotification(updatedMsg.content, meta)
      queue.markDelivered(queueId)
    } catch (err) {
      logger.error(`Retry failed for ${queueId}: ${err}`)
      retryDelivery(queueId, meta)
    }
  }, delay)
}

// --- Dedup ---
const processedMessages = new Set<string>()

// --- Graceful shutdown ---
let shuttingDown = false
function shutdown(): void {
  if (shuttingDown) return
  shuttingDown = true
  logger.info('Shutting down...')
  attachments.stop()
  setTimeout(() => process.exit(0), 2000)
}

process.stdin.on('end', shutdown)
process.stdin.on('close', shutdown)
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
process.on('unhandledRejection', (err) => { logger.error(`Unhandled rejection: ${err}`) })
process.on('uncaughtException', (err) => { logger.error(`Uncaught exception: ${err}`) })

// --- Start ---
async function main(): Promise<void> {
  await mcp.connect()

  const messageHandler = async (data: any) => {
    try {
      const { message, sender } = data.event || data
      if (!message || !sender) return

      // Dedup
      if (processedMessages.has(message.message_id)) return
      processedMessages.add(message.message_id)
      // Keep dedup set bounded
      if (processedMessages.size > 1000) {
        const first = processedMessages.values().next().value
        if (first) processedMessages.delete(first)
      }

      const chatId = message.chat_id
      const senderId = sender.sender_id?.user_id || sender.sender_id?.open_id || ''
      const senderName = senderId  // Feishu doesn't include name in event
      const messageId = message.message_id
      const messageType = message.message_type
      const content = JSON.parse(message.content || '{}')

      await handleMessage(chatId, senderId, senderName, messageId, messageType, content)
    } catch (err) {
      logger.error(`Handler error: ${err}`)
    }
  }

  const eventDispatcher = new Lark.EventDispatcher({})
    .register({ 'im.message.receive_v1': messageHandler } as any)

  client.wsClient.start({ eventDispatcher })
  logger.info('Feishu WebSocket connected')
}

main().catch((err) => {
  logger.error(`Fatal: ${err}`)
  process.exit(1)
})
