import { logger } from '@cc-channels/core'
import type { ChannelToolProvider, ToolDefinition, ToolResult } from '@cc-channels/core'
import type { Allowlist, McpChannelServer } from '@cc-channels/core'
import type { TelegramClient } from './client.js'

export class TelegramToolProvider implements ChannelToolProvider {
  channelName = 'cc-telegram'

  instructions = [
    'Messages from Telegram arrive as <channel> notifications.',
    'Use the reply tool to respond. Always include chat_id and message_id from the notification meta.',
    'The bot automatically adds 👨‍💻 when receiving and 👍 when you reply.',
    'For images, use send_image tool with a local file path.',
    'Permission approval requests are relayed through Telegram.',
  ].join(' ')

  private client: TelegramClient
  private allowlist: Allowlist
  private mcpServer: McpChannelServer | null = null

  constructor(client: TelegramClient, allowlist: Allowlist) {
    this.client = client
    this.allowlist = allowlist
  }

  setMcpServer(mcp: McpChannelServer): void {
    this.mcpServer = mcp
  }

  getTools(): ToolDefinition[] {
    return [
      {
        name: 'reply',
        description:
          'Reply to a Telegram message. Automatically threads via reply_to_message_id and adds 👍 reaction on the original message.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            chat_id: { type: 'string', description: 'Telegram chat ID' },
            text: { type: 'string', description: 'Reply text' },
            message_id: {
              type: 'string',
              description: 'Original message ID for threading and 👍 reaction',
            },
          },
          required: ['chat_id', 'text'],
        },
      },
      {
        name: 'react',
        description: 'Add an emoji reaction to a Telegram message.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            chat_id: { type: 'string', description: 'Telegram chat ID' },
            message_id: { type: 'string', description: 'Message ID to react to' },
            emoji: { type: 'string', description: 'Emoji to react with' },
          },
          required: ['chat_id', 'message_id', 'emoji'],
        },
      },
      {
        name: 'send_image',
        description: 'Send a local image file to a Telegram chat.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            chat_id: { type: 'string', description: 'Telegram chat ID' },
            image_path: { type: 'string', description: 'Local file path to the image' },
            caption: { type: 'string', description: 'Optional caption' },
          },
          required: ['chat_id', 'image_path'],
        },
      },
      {
        name: 'generate_pair_code',
        description: 'Generate a new 6-character pairing code for Telegram user registration. The code expires in 5 minutes. Tell the user to send /pair <code> in Telegram.',
        inputSchema: {
          type: 'object' as const,
          properties: {},
        },
      },
    ]
  }

  async handleToolCall(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    switch (name) {
      case 'reply': {
        const chatId = args.chat_id as string
        const text = args.text as string
        const messageId = args.message_id as string | undefined
        // Use provided message_id, or fall back to last tracked message for this chat
        const resolvedMsgId = messageId
          ? Number(messageId)
          : this.mcpServer?.getLastMessageId(chatId)
        await this.client.sendMessage(chatId, text, resolvedMsgId)
        // Always auto-react: add 💯
        if (resolvedMsgId) {
          await this.client.addReaction(chatId, resolvedMsgId, '💯')
        }
        return { content: [{ type: 'text' as const, text: 'sent' }] }
      }
      case 'react': {
        const chatId = args.chat_id as string
        const messageId = args.message_id as string
        const emoji = args.emoji as string
        await this.client.addReaction(chatId, Number(messageId), emoji)
        return { content: [{ type: 'text' as const, text: 'reacted' }] }
      }
      case 'send_image': {
        const chatId = args.chat_id as string
        const imagePath = args.image_path as string
        const caption = args.caption as string | undefined
        await this.client.sendImage(chatId, imagePath, caption)
        return { content: [{ type: 'text' as const, text: 'image sent' }] }
      }
      case 'generate_pair_code': {
        const code = this.allowlist.generatePairingCode()
        logger.info(`Pairing code generated: ${code}`)
        return { content: [{ type: 'text' as const, text: `Pairing code: ${code}\nExpires in 5 minutes. User should send /pair ${code} in Telegram.` }] }
      }
      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  }
}
