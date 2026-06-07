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
  MessagePipeline,
} from '@cc-channels/core'
import type { PreparedPayload } from '@cc-channels/core'
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

// Shared inbound-message processor; only the Feishu-specific strings live here.
const pipeline = new MessagePipeline(
  { client, allowlist, queue, mcp },
  {
    pairPrefix: 'pair ',
    newCodeCommand: 'newcode',
    ackReaction: 'THUMBSUP',
    texts: {
      pairSuccess: 'Paired successfully ✅',
      pairInvalid: 'Invalid or expired pairing code',
      newCode: (code) => `New pairing code: ${code}\nExpires in 5 minutes. Send "pair ${code}" to pair.`,
      queueFull: 'Queue full, please try again later',
      deliveryFailed: 'Message delivery failed, please retry',
    },
  }
)

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

  await pipeline.handle({
    chatId,
    senderId,
    senderName,
    messageId,
    text,
    // Feishu-specific: download attachments and build the delivery payload.
    prepare: async (): Promise<PreparedPayload> => {
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

      return { content, attachments: rawAttachments, meta }
    },
  })
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
