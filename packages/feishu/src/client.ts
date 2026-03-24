import * as Lark from '@larksuiteoapi/node-sdk'
import { readFileSync } from 'node:fs'
import type { ChannelClient } from '@cc-channels/core'
import { logger } from '@cc-channels/core'

export class FeishuClient implements ChannelClient {
  public larkClient: Lark.Client
  public wsClient: Lark.WSClient

  constructor(appId: string, appSecret: string) {
    this.larkClient = new Lark.Client({
      appId,
      appSecret,
      appType: Lark.AppType.SelfBuild,
      domain: Lark.Domain.Feishu,
    })
    this.wsClient = new Lark.WSClient({ appId, appSecret })
  }

  async sendMessage(chatId: string, text: string, replyToId?: string | number): Promise<string> {
    const res = await this.withRetry(() =>
      this.larkClient.im.v1.message.create({
        params: { receive_id_type: 'chat_id' },
        data: {
          receive_id: chatId,
          msg_type: 'text',
          content: JSON.stringify({ text }),
          ...(replyToId ? { root_id: String(replyToId) } : {}),
        },
      })
    )
    return (res as any)?.data?.message_id || ''
  }

  async sendImage(chatId: string, filePath: string, caption?: string): Promise<string> {
    const imgBuf = readFileSync(filePath)
    const uploadRes = await this.larkClient.im.v1.image.create({
      data: { image_type: 'message', image: imgBuf },
    })
    const imageKey = (uploadRes as any)?.data?.image_key
    if (!imageKey) throw new Error('Image upload failed')

    const res = await this.larkClient.im.v1.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        msg_type: 'image',
        content: JSON.stringify({ image_key: imageKey }),
      },
    })
    return (res as any)?.data?.message_id || ''
  }

  async addReaction(chatId: string, messageId: string | number, emoji: string): Promise<void> {
    try {
      await (this.larkClient.im.v1.messageReaction as any).create({
        path: { message_id: String(messageId) },
        data: { reaction_type: { emoji_type: emoji } },
      })
    } catch (err) {
      logger.warn(`Feishu reaction failed: ${err}`)
    }
  }

  async getFileUrl(fileId: string): Promise<string> {
    // Feishu doesn't provide direct file URLs like Telegram.
    // Files need to be downloaded via API using message_id + file_key.
    // For now, this is a placeholder. Actual file download is handled
    // differently in the Feishu helpers.
    logger.warn('Feishu getFileUrl is not directly supported. Use downloadFile instead.')
    return ''
  }

  async downloadFile(messageId: string, fileKey: string, type: string): Promise<Buffer> {
    const res = await (this.larkClient.im.v1.messageResource as any).get({
      path: { message_id: messageId, file_key: fileKey },
      params: { type },
    })
    // The response should contain the file data
    return Buffer.from(res as any)
  }

  private async withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn()
      } catch (err) {
        if (attempt === maxRetries) throw err
        const delay = 2000 * Math.pow(2, attempt)
        logger.warn(`Feishu API error, retrying in ${delay}ms: ${err}`)
        await new Promise(r => setTimeout(r, delay))
      }
    }
    throw new Error('unreachable')
  }
}
