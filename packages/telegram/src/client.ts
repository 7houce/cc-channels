import { Bot, GrammyError } from 'grammy'
import { logger } from '@cc-channels/core'
import type { ChannelClient } from '@cc-channels/core'

const MIN_SEND_INTERVAL_MS = 50

export class TelegramClient implements ChannelClient {
  public bot: Bot
  private lastSendAt = 0

  constructor(token: string) {
    this.bot = new Bot(token)
  }

  async sendMessage(chatId: string, text: string, replyToId?: string | number): Promise<number> {
    await this.throttle()
    const replyToMessageId = replyToId ? Number(replyToId) : undefined
    const result = await this.withRetry(() =>
      this.bot.api.sendMessage(Number(chatId), text, {
        reply_parameters: replyToMessageId
          ? { message_id: replyToMessageId }
          : undefined,
      })
    )
    return result.message_id
  }

  async addReaction(chatId: string, messageId: string | number, ...emojis: string[]): Promise<void> {
    await this.throttle()
    try {
      await this.bot.api.setMessageReaction(Number(chatId), Number(messageId),
        emojis.map(emoji => ({ type: 'emoji', emoji }) as any)
      )
    } catch (err) {
      // Non-whitelisted emoji silently fails
      if (err instanceof GrammyError && err.error_code === 400) {
        logger.warn(`Reaction failed (unsupported emoji "${emojis.join(',')}"): ${err.description}`)
      } else {
        throw err
      }
    }
  }

  async sendImage(chatId: string, filePath: string, caption?: string): Promise<number> {
    await this.throttle()
    const { createReadStream } = await import('node:fs')
    const { InputFile } = await import('grammy')
    const result = await this.withRetry(() =>
      this.bot.api.sendPhoto(Number(chatId), new InputFile(createReadStream(filePath)), {
        caption,
      })
    )
    return result.message_id
  }

  async getFileUrl(fileId: string): Promise<string> {
    const file = await this.bot.api.getFile(fileId)
    return `https://api.telegram.org/file/bot${this.bot.token}/${file.file_path}`
  }

  private async throttle(): Promise<void> {
    const now = Date.now()
    const elapsed = now - this.lastSendAt
    if (elapsed < MIN_SEND_INTERVAL_MS) {
      await new Promise(r => setTimeout(r, MIN_SEND_INTERVAL_MS - elapsed))
    }
    this.lastSendAt = Date.now()
  }

  private async withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn()
      } catch (err) {
        if (attempt === maxRetries) throw err
        const delay = 2000 * Math.pow(2, attempt)
        logger.warn(`Telegram API error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries}): ${err}`)
        await new Promise(r => setTimeout(r, delay))
      }
    }
    throw new Error('unreachable')
  }
}
