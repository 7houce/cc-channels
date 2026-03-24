import type { Attachment } from '@cc-channels/core'

const UNSUPPORTED_TYPES = ['audio', 'media', 'sticker', 'share_chat', 'share_user'] as const

export function getUnsupportedType(messageType: string): string | null {
  if ((UNSUPPORTED_TYPES as readonly string[]).includes(messageType)) return messageType
  return null
}

export function extractAttachments(messageType: string, content: any): Attachment[] {
  const result: Attachment[] = []
  if (messageType === 'image' && content.image_key) {
    result.push({ type: 'photo', fileId: content.image_key })
  }
  if (messageType === 'file' && content.file_key) {
    result.push({
      type: 'document',
      fileId: content.file_key,
      fileName: content.file_name,
    })
  }
  return result
}

export function extractTextContent(messageType: string, content: any): string {
  if (messageType === 'text') return content.text || ''
  if (messageType === 'post') {
    // Extract plain text from rich text post
    try {
      const post = content.zh_cn || content.en_us || Object.values(content)[0] as any
      if (!post?.content) return ''
      return post.content
        .flat()
        .filter((item: any) => item.tag === 'text')
        .map((item: any) => item.text)
        .join('')
    } catch { return '' }
  }
  return ''
}
