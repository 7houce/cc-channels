import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import type { ChannelClient, ChannelToolProvider } from './interfaces.js'
import { logger } from './logger.js'

export const PERMISSION_REPLY_RE = /^\s*(y|yes|n|no)\s+([a-km-z]{5})\s*$/i

const PermissionRequestSchema = z.object({
  method: z.literal('notifications/claude/channel/permission_request'),
  params: z.object({
    request_id: z.string(),
    tool_name: z.string(),
    description: z.string(),
    input_preview: z.string(),
  }),
})

export class McpChannelServer {
  private server: Server
  private client: ChannelClient
  private toolProvider: ChannelToolProvider
  private permissionChatId: string | null = null
  private lastMessageIdByChat: Map<string, string | number> = new Map()

  constructor(client: ChannelClient, toolProvider: ChannelToolProvider) {
    this.client = client
    this.toolProvider = toolProvider

    this.server = new Server(
      { name: toolProvider.channelName, version: '0.1.0' },
      {
        capabilities: {
          experimental: {
            'claude/channel': {},
            'claude/channel/permission': {},
          },
          tools: {},
        },
        instructions: toolProvider.instructions,
      }
    )

    this.registerToolHandlers()
    this.registerPermissionHandler()
  }

  async connect(): Promise<void> {
    const transport = new StdioServerTransport()
    await this.server.connect(transport)
    logger.info('MCP server connected via stdio')
  }

  async sendNotification(content: string, meta: Record<string, string>): Promise<void> {
    await (this.server as any).notification({
      method: 'notifications/claude/channel',
      params: { content, meta },
    })
  }

  isPermissionReply(text: string): boolean {
    return PERMISSION_REPLY_RE.test(text)
  }

  async handlePermissionReply(text: string): Promise<void> {
    const match = PERMISSION_REPLY_RE.exec(text)
    if (!match) return
    const [, verdict, requestId] = match
    const behavior = verdict.toLowerCase().startsWith('y') ? 'allow' : 'deny'
    await (this.server as any).notification({
      method: 'notifications/claude/channel/permission',
      params: { request_id: requestId.toLowerCase(), behavior },
    })
    logger.info(`Permission ${behavior} for request ${requestId}`)
  }

  setPermissionChatId(chatId: string): void {
    this.permissionChatId = chatId
  }

  trackInboundMessage(chatId: string, messageId: string | number): void {
    this.lastMessageIdByChat.set(chatId, messageId)
  }

  getLastMessageId(chatId: string): string | number | undefined {
    return this.lastMessageIdByChat.get(chatId)
  }

  private registerToolHandlers(): void {
    const tools = this.toolProvider.getTools()

    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }))

    this.server.setRequestHandler(CallToolRequestSchema, async (req) => {
      const { name, arguments: args } = req.params
      try {
        return await this.toolProvider.handleToolCall(name, (args || {}) as Record<string, unknown>) as any
      } catch (err) {
        logger.error(`Tool ${name} failed: ${err}`)
        return {
          content: [{ type: 'text' as const, text: `Error: ${err}` }],
          isError: true,
        }
      }
    })
  }

  private registerPermissionHandler(): void {
    this.server.setNotificationHandler(PermissionRequestSchema, async ({ params }) => {
      if (!this.permissionChatId) {
        logger.warn('Permission request received but no chat ID set')
        return
      }
      const msg =
        `🔐 Claude wants to run ${params.tool_name}:\n` +
        `${params.description}\n\n` +
        `Preview: ${params.input_preview}\n\n` +
        `Reply "yes ${params.request_id}" to allow or "no ${params.request_id}" to deny`
      await this.client.sendMessage(this.permissionChatId, msg)
      logger.info(`Permission request sent: ${params.request_id} (${params.tool_name})`)
    })
  }
}
