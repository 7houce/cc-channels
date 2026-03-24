import { describe, it, expect, beforeEach } from 'vitest'
import { MessageQueue } from '../message-queue.js'

describe('MessageQueue', () => {
  let queue: MessageQueue

  beforeEach(() => {
    queue = new MessageQueue(5) // small capacity for testing
  })

  it('enqueues a message with pending status', () => {
    const msg = queue.enqueue({
      chatId: '100',
      content: 'hello',
      senderId: '1',
      messageId: '10',
    })
    expect(msg.status).toBe('pending')
    expect(msg.retryCount).toBe(0)
    expect(queue.size).toBe(1)
  })

  it('deduplicates by chatId + messageId', () => {
    queue.enqueue({ chatId: '100', content: 'a', senderId: '1', messageId: '10' })
    queue.enqueue({ chatId: '100', content: 'b', senderId: '1', messageId: '10' })
    expect(queue.size).toBe(1)
  })

  it('allows same messageId from different chats', () => {
    queue.enqueue({ chatId: '100', content: 'a', senderId: '1', messageId: '10' })
    queue.enqueue({ chatId: '200', content: 'b', senderId: '2', messageId: '10' })
    expect(queue.size).toBe(2)
  })

  it('returns pending messages in FIFO order', () => {
    queue.enqueue({ chatId: '100', content: 'first', senderId: '1', messageId: '1' })
    queue.enqueue({ chatId: '100', content: 'second', senderId: '1', messageId: '2' })
    const pending = queue.getPending()
    expect(pending[0].content).toBe('first')
    expect(pending[1].content).toBe('second')
  })

  it('marks message as delivered', () => {
    const msg = queue.enqueue({ chatId: '100', content: 'hello', senderId: '1', messageId: '10' })
    queue.markDelivered(msg.id)
    expect(queue.get(msg.id)?.status).toBe('delivered')
  })

  it('removes message from queue after max retries', () => {
    const msg = queue.enqueue({ chatId: '100', content: 'hello', senderId: '1', messageId: '10' })
    queue.markRetry(msg.id)
    queue.markRetry(msg.id)
    queue.markRetry(msg.id) // 3rd retry → failed and removed
    expect(queue.get(msg.id)).toBeUndefined()
    expect(queue.size).toBe(0)
  })

  it('increments retryCount on markRetry', () => {
    const msg = queue.enqueue({ chatId: '100', content: 'hello', senderId: '1', messageId: '10' })
    queue.markRetry(msg.id)
    expect(queue.get(msg.id)?.retryCount).toBe(1)
    queue.markRetry(msg.id)
    expect(queue.get(msg.id)?.retryCount).toBe(2)
  })

  it('evicts oldest delivered when at capacity', () => {
    // Fill queue
    for (let i = 0; i < 5; i++) {
      const m = queue.enqueue({ chatId: '100', content: `msg${i}`, senderId: '1', messageId: `${i}` })
      queue.markDelivered(m.id)
    }
    expect(queue.size).toBe(5)
    // Enqueue one more — should evict oldest delivered
    queue.enqueue({ chatId: '100', content: 'new', senderId: '1', messageId: '99' })
    expect(queue.size).toBe(5)
  })

  it('rejects when at capacity with no delivered messages', () => {
    for (let i = 0; i < 5; i++) {
      queue.enqueue({ chatId: '100', content: `msg${i}`, senderId: '1', messageId: `${i}` })
    }
    const result = queue.enqueue({ chatId: '100', content: 'overflow', senderId: '1', messageId: '99' })
    expect(result).toBeNull()
  })

  it('calculates retry delay with exponential backoff', () => {
    const msg = queue.enqueue({ chatId: '100', content: 'hello', senderId: '1', messageId: '10' })
    expect(queue.getRetryDelay(msg.id)).toBe(2000)
    queue.markRetry(msg.id)
    expect(queue.getRetryDelay(msg.id)).toBe(4000)
    queue.markRetry(msg.id)
    expect(queue.getRetryDelay(msg.id)).toBe(8000)
  })
})
