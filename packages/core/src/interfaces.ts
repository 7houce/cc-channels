import type { ToolDefinition, ToolResult } from './types.js'

export interface ChannelClient {
  sendMessage(chatId: string, text: string, replyToId?: string | number): Promise<string | number>
  sendImage(chatId: string, filePath: string, caption?: string): Promise<string | number>
  addReaction(chatId: string, messageId: string | number, emoji: string): Promise<void>
  getFileUrl(fileId: string): Promise<string>
}

export interface ChannelToolProvider {
  channelName: string
  instructions: string
  getTools(): ToolDefinition[]
  handleToolCall(name: string, args: Record<string, unknown>): Promise<ToolResult>
}
