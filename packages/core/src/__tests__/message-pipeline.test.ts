import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdirSync, existsSync, unlinkSync } from 'node:fs'
import { MessagePipeline } from '../message-pipeline.js'
import type { InboundMessage, PipelineConfig, PreparedPayload } from '../message-pipeline.js'
import { MessageQueue } from '../message-queue.js'
import { Allowlist } from '../allowlist.js'

// Minimal fakes for the collaborators the pipeline only calls a few methods on.
function makeClient() {
  return {
    sendMessage: vi.fn(async () => 1),
    addReaction: vi.fn(async () => {}),
  }
}

function makeMcp(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    setPermissionChatId: vi.fn(),
    isPermissionReply: vi.fn(() => false),
    handlePermissionReply: vi.fn(async () => {}),
    trackInboundMessage: vi.fn(),
    sendNotification: vi.fn(async () => {}),
    ...overrides,
  }
}

const CONFIG: PipelineConfig = {
  pairPrefix: '/pair ',
  newCodeCommand: '/newcode',
  ackReaction: '👨‍💻',
  texts: {
    pairSuccess: 'paired',
    pairInvalid: 'invalid',
    newCode: (code) => `code ${code}`,
    queueFull: 'full',
    deliveryFailed: 'failed',
  },
}

function inbound(partial: Partial<InboundMessage> & { text: string }): InboundMessage {
  const prepared: PreparedPayload = {
    content: partial.text,
    attachments: [],
    meta: { chat_id: partial.chatId ?? 'C1' },
  }
  return {
    chatId: 'C1',
    senderId: 'U1',
    senderName: 'Tom',
    messageId: 'M1',
    prepare: async () => prepared,
    ...partial,
  }
}

describe('MessagePipeline', () => {
  const testDir = join(tmpdir(), 'pipeline-test-' + Date.now())
  let allowlist: Allowlist
  let queue: MessageQueue
  let client: ReturnType<typeof makeClient>

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
    allowlist = new Allowlist(join(testDir, 'allowlist.json'))
    queue = new MessageQueue()
    client = makeClient()
  })

  afterEach(() => {
    const path = join(testDir, 'allowlist.json')
    if (existsSync(path)) unlinkSync(path)
  })

  it('valid pairing command adds the user and confirms, bypassing the allowlist', async () => {
    const code = allowlist.generatePairingCode()
    const mcp = makeMcp()
    const pipeline = new MessagePipeline(
      { client, allowlist, queue, mcp: mcp as never },
      CONFIG
    )

    await pipeline.handle(inbound({ text: `/pair ${code}` }))

    expect(allowlist.isAllowed('U1')).toBe(true)
    expect(client.sendMessage).toHaveBeenCalledWith('C1', 'paired')
    expect(mcp.sendNotification).not.toHaveBeenCalled()
  })

  it('invalid pairing code does not add the user', async () => {
    const mcp = makeMcp()
    const pipeline = new MessagePipeline(
      { client, allowlist, queue, mcp: mcp as never },
      CONFIG
    )

    await pipeline.handle(inbound({ text: '/pair ZZZZZ' }))

    expect(allowlist.isAllowed('U1')).toBe(false)
    expect(client.sendMessage).toHaveBeenCalledWith('C1', 'invalid')
  })

  it('silently drops messages from non-allowlisted senders', async () => {
    const mcp = makeMcp()
    const pipeline = new MessagePipeline(
      { client, allowlist, queue, mcp: mcp as never },
      CONFIG
    )

    await pipeline.handle(inbound({ text: 'hello' }))

    expect(client.addReaction).not.toHaveBeenCalled()
    expect(mcp.sendNotification).not.toHaveBeenCalled()
    expect(queue.size).toBe(0)
  })

  it('acks, enqueues and delivers an allowlisted message', async () => {
    allowlist.addUser('U1', 'Tom')
    const mcp = makeMcp()
    const pipeline = new MessagePipeline(
      { client, allowlist, queue, mcp: mcp as never },
      CONFIG
    )

    await pipeline.handle(inbound({ text: 'hello' }))

    expect(client.addReaction).toHaveBeenCalledWith('C1', 'M1', '👨‍💻')
    expect(mcp.trackInboundMessage).toHaveBeenCalledWith('C1', 'M1')
    expect(mcp.sendNotification).toHaveBeenCalledTimes(1)
    expect(mcp.sendNotification).toHaveBeenCalledWith('hello', { chat_id: 'C1' })
  })

  it('routes permission replies to the mcp handler without enqueuing', async () => {
    allowlist.addUser('U1', 'Tom')
    const mcp = makeMcp({ isPermissionReply: vi.fn(() => true) })
    const pipeline = new MessagePipeline(
      { client, allowlist, queue, mcp: mcp as never },
      CONFIG
    )

    await pipeline.handle(inbound({ text: 'yes abcde' }))

    expect(mcp.handlePermissionReply).toHaveBeenCalledWith('yes abcde')
    expect(client.addReaction).not.toHaveBeenCalled()
    expect(queue.size).toBe(0)
  })

  it('does not call prepare() for gated (non-allowlisted) messages', async () => {
    const mcp = makeMcp()
    const prepare = vi.fn(async (): Promise<PreparedPayload> => ({
      content: 'x',
      attachments: [],
      meta: {},
    }))
    const pipeline = new MessagePipeline(
      { client, allowlist, queue, mcp: mcp as never },
      CONFIG
    )

    await pipeline.handle({ ...inbound({ text: 'hello' }), prepare })

    expect(prepare).not.toHaveBeenCalled()
  })
})
