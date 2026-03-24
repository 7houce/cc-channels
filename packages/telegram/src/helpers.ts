import type { Attachment } from '@cc-channels/core'

const UNSUPPORTED_MEDIA = ['voice', 'audio', 'video', 'sticker', 'video_note', 'animation', 'location'] as const

export function getUnsupportedType(msg: any): string | null {
  for (const type of UNSUPPORTED_MEDIA) {
    if (msg[type]) return type
  }
  return null
}

export function extractAttachments(msg: any): Attachment[] {
  const result: Attachment[] = []

  if (msg.photo && msg.photo.length > 0) {
    const best = msg.photo[msg.photo.length - 1]
    result.push({
      type: 'photo',
      fileId: best.file_id,
      fileSize: best.file_size,
    })
  }

  if (msg.document) {
    result.push({
      type: 'document',
      fileId: msg.document.file_id,
      fileName: msg.document.file_name,
      mimeType: msg.document.mime_type,
      fileSize: msg.document.file_size,
    })
  }

  return result
}
