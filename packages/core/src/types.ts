export interface Attachment {
  type: 'photo' | 'document'
  fileId: string
  localPath?: string
  mimeType?: string
  fileName?: string
  fileSize?: number
}

export interface QueuedMessage {
  id: string
  chatId: string
  content: string
  attachments?: Attachment[]
  senderId: string
  messageId: string
  status: 'pending' | 'delivered' | 'failed'
  retryCount: number
  createdAt: number
  lastRetryAt?: number
}

export interface AllowedUser {
  user_id: string
  name: string
  paired_at: string
}

export interface AllowlistData {
  allowed_users: AllowedUser[]
}

export interface PairingCode {
  code: string
  expiresAt: number
}

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}
