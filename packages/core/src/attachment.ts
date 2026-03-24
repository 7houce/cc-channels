import { mkdirSync, existsSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { ChannelClient } from './interfaces.js'
import { Attachment } from './types.js'
import { logger } from './logger.js'

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000 // 10 minutes
const FILE_TTL_MS = 60 * 60 * 1000 // 1 hour

export class AttachmentHandler {
  private client: Pick<ChannelClient, 'getFileUrl'>
  private tempDir: string
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor(client: Pick<ChannelClient, 'getFileUrl'>, tempDir: string) {
    this.client = client
    this.tempDir = tempDir
    this.ensureTempDir()
    this.startCleanup()
  }

  async download(attachment: Attachment, messageId: string): Promise<string | null> {
    if (attachment.fileSize && attachment.fileSize > MAX_FILE_SIZE) {
      logger.warn(`Attachment too large: ${attachment.fileSize} bytes (max ${MAX_FILE_SIZE})`)
      return null
    }

    try {
      const url = await this.client.getFileUrl(attachment.fileId)
      const res = await fetch(url)
      if (!res.ok) {
        logger.error(`Failed to download attachment: HTTP ${res.status}`)
        return null
      }

      const buf = Buffer.from(await res.arrayBuffer())
      const ext = attachment.fileName
        ? extname(attachment.fileName)
        : attachment.type === 'photo'
          ? '.jpg'
          : ''
      const fileName = `${attachment.type}_${messageId}${ext}`
      const filePath = join(this.tempDir, fileName)
      await writeFile(filePath, buf)
      logger.info(`Downloaded attachment: ${filePath} (${buf.length} bytes)`)
      return filePath
    } catch (err) {
      logger.error(`Failed to download attachment: ${err}`)
      return null
    }
  }

  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }

  private ensureTempDir(): void {
    if (!existsSync(this.tempDir)) {
      mkdirSync(this.tempDir, { recursive: true })
      logger.info(`Created temp directory: ${this.tempDir}`)
    }
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS)
  }

  private cleanup(): void {
    if (!existsSync(this.tempDir)) return
    const now = Date.now()
    let cleaned = 0
    for (const file of readdirSync(this.tempDir)) {
      const filePath = join(this.tempDir, file)
      try {
        const stat = statSync(filePath)
        if (now - stat.mtimeMs > FILE_TTL_MS) {
          unlinkSync(filePath)
          cleaned++
        }
      } catch {
        // ignore
      }
    }
    if (cleaned > 0) logger.info(`Cleaned up ${cleaned} temp file(s)`)
  }
}
