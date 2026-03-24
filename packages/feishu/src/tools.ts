import type { ChannelToolProvider, ToolDefinition, ToolResult } from '@cc-channels/core'
import { Allowlist, logger } from '@cc-channels/core'
import type { McpChannelServer } from '@cc-channels/core'
import { FeishuClient } from './client.js'

export class FeishuToolProvider implements ChannelToolProvider {
  channelName = 'cc-feishu'
  instructions = [
    'Messages from Feishu (飞书) arrive as <channel> notifications.',
    'Use the reply tool to respond. Always include chat_id from the notification meta.',
    'The bot automatically adds a THUMBSUP reaction when receiving and DONE when you reply.',
    'For images, use send_image tool with a local file path.',
    'Permission approval requests are relayed through Feishu.',
  ].join(' ')

  private mcpServer: McpChannelServer | null = null

  constructor(
    private client: FeishuClient,
    private allowlist: Allowlist,
  ) {}

  setMcpServer(server: McpChannelServer): void {
    this.mcpServer = server
  }

  getTools(): ToolDefinition[] {
    return [
      {
        name: 'reply',
        description: 'Reply to a Feishu message. Auto-threads and adds DONE reaction.',
        inputSchema: {
          type: 'object',
          properties: {
            chat_id: { type: 'string', description: 'Feishu chat ID' },
            text: { type: 'string', description: 'Reply text' },
            message_id: { type: 'string', description: 'Original message ID' },
          },
          required: ['chat_id', 'text'],
        },
      },
      {
        name: 'send_image',
        description: 'Send a local image file to a Feishu chat.',
        inputSchema: {
          type: 'object',
          properties: {
            chat_id: { type: 'string', description: 'Feishu chat ID' },
            image_path: { type: 'string', description: 'Local file path' },
            caption: { type: 'string', description: 'Optional caption' },
          },
          required: ['chat_id', 'image_path'],
        },
      },
      {
        name: 'generate_pair_code',
        description: 'Generate a pairing code. User sends "pair <code>" in Feishu.',
        inputSchema: { type: 'object', properties: {} },
      },
    ]
  }

  async handleToolCall(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    switch (name) {
      case 'reply': {
        const chatId = args.chat_id as string
        const text = args.text as string
        const messageId = args.message_id as string | undefined
        const resolvedMsgId = messageId || (this.mcpServer?.getLastMessageId(chatId) as string | undefined)
        await this.client.sendMessage(chatId, text, resolvedMsgId)
        if (resolvedMsgId) {
          await this.client.addReaction(chatId, resolvedMsgId, 'DONE')
        }
        return { content: [{ type: 'text', text: 'sent' }] }
      }
      case 'send_image': {
        await this.client.sendImage(args.chat_id as string, args.image_path as string, args.caption as string | undefined)
        return { content: [{ type: 'text', text: 'image sent' }] }
      }
      case 'generate_pair_code': {
        const code = this.allowlist.generatePairingCode()
        logger.info(`Pairing code generated: ${code}`)
        return { content: [{ type: 'text', text: `Pairing code: ${code}\nExpires in 5 minutes. Send "pair ${code}" in Feishu.` }] }
      }
      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  }
}
