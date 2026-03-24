#!/usr/bin/env node
import 'dotenv/config'
import { logger, MessageQueue, Allowlist, AttachmentHandler, McpChannelServer } from '@cc-channels/core'
import type { Attachment } from '@cc-channels/core'
import { TelegramClient } from './client.js'
import { TelegramToolProvider } from './tools.js'
import { getUnsupportedType, extractAttachments } from './helpers.js'
import { join } from 'node:path'
import { GrammyError } from 'grammy'

// --- Config ---
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
if (!BOT_TOKEN) {
  logger.error('TELEGRAM_BOT_TOKEN not set')
  process.exit(1)
}

const PROJECT_DIR = process.env.PROJECT_DIR || process.cwd()
const ALLOWLIST_PATH = join(PROJECT_DIR, 'allowlist.json')

// --- Init modules ---
const client = new TelegramClient(BOT_TOKEN)
const queue = new MessageQueue()
const allowlist = new Allowlist(ALLOWLIST_PATH)

// Two-phase init: toolProvider needs mcpServer reference, mcpServer needs toolProvider
const toolProvider = new TelegramToolProvider(client, allowlist)
const mcp = new McpChannelServer(client, toolProvider)
toolProvider.setMcpServer(mcp)

const attachments = new AttachmentHandler(client, '/tmp/claude-channel-telegram')

// --- Pairing code on startup ---
const GENERATE_PAIR_CODE = process.env.GENERATE_PAIR_CODE === 'true'
if (!allowlist.hasAnyUsers() || GENERATE_PAIR_CODE) {
  const code = allowlist.generatePairingCode()
  logger.info(`Pairing code: ${code} — send /pair ${code} in Telegram (expires in 5 min)`)
}

// --- Process inbound message ---
async function handleMessage(chatId: string, senderId: string, senderName: string, messageId: number, text: string, rawMsg: any): Promise<void> {
  // Commands: /pair and /newcode bypass allowlist
  if (text.startsWith('/pair ')) {
    const code = text.slice(6).trim()
    if (allowlist.validatePairingCode(code)) {
      allowlist.addUser(senderId, senderName)
      await client.sendMessage(chatId, '配对成功 ✅')
    } else {
      await client.sendMessage(chatId, '配对码无效或已过期')
    }
    return
  }

  if (text === '/newcode') {
    if (!allowlist.isAllowed(senderId)) {
      return // silently drop
    }
    const code = allowlist.generatePairingCode()
    await client.sendMessage(chatId, `新配对码: ${code}\n5 分钟内有效，发送 /pair ${code} 完成配对`)
    return
  }

  // Allowlist check
  if (!allowlist.isAllowed(senderId)) {
    return // silently drop
  }

  // Set permission chat ID to the first allowed user's chat
  mcp.setPermissionChatId(chatId)

  // Check for permission reply
  if (mcp.isPermissionReply(text)) {
    await mcp.handlePermissionReply(text)
    return
  }

  // React 👨‍💻 and track message for auto 💯
  await client.addReaction(chatId, messageId, '👨‍💻')
  mcp.trackInboundMessage(chatId, messageId)

  // Check unsupported media
  const unsupported = getUnsupportedType(rawMsg)
  let content = text || ''
  if (unsupported) {
    content = content ? `${content}\n（不支持的附件类型: ${unsupported}）` : `（不支持的附件类型: ${unsupported}）`
  }

  // Extract and download attachments
  const rawAttachments = extractAttachments(rawMsg)
  const meta: Record<string, string> = {
    chat_id: chatId,
    sender: senderName,
    message_id: String(messageId),
  }

  for (const att of rawAttachments) {
    const localPath = await attachments.download(att, String(messageId))
    if (localPath) {
      att.localPath = localPath
      if (att.type === 'photo') {
        meta.has_image = 'true'
        meta.image_path = localPath
      } else {
        meta.has_file = 'true'
        meta.file_path = localPath
      }
    } else if (att.fileSize && att.fileSize > 20 * 1024 * 1024) {
      content += '\n（附件过大，无法下载）'
    }
  }

  if (!content && rawAttachments.length === 0) {
    return // empty message, skip
  }

  // Enqueue
  const queued = queue.enqueue({
    chatId,
    content: content || '(attachment)',
    senderId,
    messageId: String(messageId),
    attachments: rawAttachments.length > 0 ? rawAttachments : undefined,
  })

  if (!queued) {
    await client.sendMessage(chatId, '队列已满，请稍后再试')
    return
  }

  // Deliver via MCP notification
  try {
    await mcp.sendNotification(queued.content, meta)
    queue.markDelivered(queued.id)
  } catch (err) {
    logger.error(`Failed to deliver message ${queued.id}: ${err}`)
    await retryDelivery(queued.id, meta)
  }
}

async function retryDelivery(queueId: string, meta: Record<string, string>): Promise<void> {
  const msg = queue.get(queueId)
  if (!msg || msg.status === 'failed') return

  queue.markRetry(queueId)
  const updatedMsg = queue.get(queueId)
  if (!updatedMsg || updatedMsg.status === 'failed') {
    await client.sendMessage(msg.chatId, '消息投递失败，请重试')
    return
  }

  const delay = queue.getRetryDelay(queueId)
  setTimeout(async () => {
    try {
      await mcp.sendNotification(updatedMsg.content, meta)
      queue.markDelivered(queueId)
    } catch (err) {
      logger.error(`Retry failed for ${queueId}: ${err}`)
      await retryDelivery(queueId, meta)
    }
  }, delay)
}

// --- Set up Telegram bot handlers ---
const bot = client.bot

bot.on('message', async (ctx) => {
  const msg = ctx.message
  const chatId = String(msg.chat.id)
  const senderId = String(msg.from?.id || '')
  const senderName = msg.from?.username || msg.from?.first_name || senderId
  const messageId = msg.message_id
  const text = msg.text || msg.caption || ''

  await handleMessage(chatId, senderId, senderName, messageId, text, msg)
})

bot.catch((err) => {
  logger.error(`Bot handler error (polling continues): ${err.error}`)
})

// --- Graceful shutdown ---
let shuttingDown = false
function shutdown(): void {
  if (shuttingDown) return
  shuttingDown = true
  logger.info('Shutting down...')
  attachments.stop()
  setTimeout(() => process.exit(0), 2000)
  void Promise.resolve(bot.stop()).finally(() => process.exit(0))
}

process.stdin.on('end', shutdown)
process.stdin.on('close', shutdown)
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled rejection: ${err}`)
})
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception: ${err}`)
})

// --- Start ---
async function main(): Promise<void> {
  // Connect MCP first (stdio)
  await mcp.connect()

  // Start Telegram polling with resilient loop (spec: 5s → 10s → 20s → max 60s)
  void (async () => {
    let consecutiveFailures = 0
    for (;;) {
      try {
        await bot.start({
          onStart: (info) => {
            logger.info(`Polling as @${info.username}`)
            consecutiveFailures = 0 // reset on success
          },
        })
        return // clean exit (bot.stop() called)
      } catch (err) {
        consecutiveFailures++
        const baseDelay = err instanceof GrammyError && err.error_code === 409
          ? 1000 // 409 Conflict: shorter base
          : 5000 // other errors: 5s base per spec
        const delay = Math.min(baseDelay * Math.pow(2, consecutiveFailures - 1), 60000)
        logger.warn(`Polling failed (attempt ${consecutiveFailures}), retrying in ${delay}ms: ${err}`)
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  })()
}

main().catch((err) => {
  logger.error(`Fatal: ${err}`)
  process.exit(1)
})
