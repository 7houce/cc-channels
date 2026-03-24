import { randomUUID } from 'node:crypto'
import { QueuedMessage, Attachment } from './types.js'

const MAX_RETRIES = 3
const BASE_DELAY_MS = 2000

interface EnqueueParams {
  chatId: string
  content: string
  senderId: string
  messageId: string
  attachments?: Attachment[]
}

export class MessageQueue {
  private messages: Map<string, QueuedMessage> = new Map()
  private seen: Set<string> = new Set() // "chatId:messageId" dedup keys
  private capacity: number

  constructor(capacity = 100) {
    this.capacity = capacity
  }

  get size(): number {
    return this.messages.size
  }

  enqueue(params: EnqueueParams): QueuedMessage | null {
    const dedupKey = `${params.chatId}:${params.messageId}`
    if (this.seen.has(dedupKey)) {
      // Return the existing message (dedup)
      for (const msg of this.messages.values()) {
        if (msg.chatId === params.chatId && msg.messageId === params.messageId) {
          return msg
        }
      }
    }

    if (this.messages.size >= this.capacity) {
      if (!this.evictOldestDelivered()) {
        return null // queue full, no delivered to evict
      }
    }

    const msg: QueuedMessage = {
      id: randomUUID(),
      chatId: params.chatId,
      content: params.content,
      attachments: params.attachments,
      senderId: params.senderId,
      messageId: params.messageId,
      status: 'pending',
      retryCount: 0,
      createdAt: Date.now(),
    }

    this.messages.set(msg.id, msg)
    this.seen.add(dedupKey)
    return msg
  }

  get(id: string): QueuedMessage | undefined {
    return this.messages.get(id)
  }

  getPending(): QueuedMessage[] {
    return [...this.messages.values()]
      .filter(m => m.status === 'pending')
      .sort((a, b) => a.createdAt - b.createdAt)
  }

  markDelivered(id: string): void {
    const msg = this.messages.get(id)
    if (msg) msg.status = 'delivered'
  }

  markRetry(id: string): void {
    const msg = this.messages.get(id)
    if (!msg) return
    msg.retryCount++
    msg.lastRetryAt = Date.now()
    if (msg.retryCount >= MAX_RETRIES) {
      msg.status = 'failed'
      // Remove failed messages to prevent unbounded growth
      this.messages.delete(id)
      this.seen.delete(`${msg.chatId}:${msg.messageId}`)
    }
  }

  markFailed(id: string): void {
    const msg = this.messages.get(id)
    if (msg) {
      msg.status = 'failed'
      // Remove failed messages from queue to prevent unbounded growth
      this.messages.delete(id)
      this.seen.delete(`${msg.chatId}:${msg.messageId}`)
    }
  }

  getRetryDelay(id: string): number {
    const msg = this.messages.get(id)
    if (!msg) return BASE_DELAY_MS
    return BASE_DELAY_MS * Math.pow(2, msg.retryCount)
  }

  private evictOldestDelivered(): boolean {
    let oldest: QueuedMessage | null = null
    for (const msg of this.messages.values()) {
      if (msg.status === 'delivered') {
        if (!oldest || msg.createdAt < oldest.createdAt) {
          oldest = msg
        }
      }
    }
    if (!oldest) return false
    this.messages.delete(oldest.id)
    this.seen.delete(`${oldest.chatId}:${oldest.messageId}`)
    return true
  }
}
