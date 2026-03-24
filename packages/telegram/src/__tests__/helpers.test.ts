import { describe, it, expect } from 'vitest'
import { getUnsupportedType, extractAttachments } from '../helpers.js'

describe('getUnsupportedType', () => {
  it('returns null for text-only message', () => {
    expect(getUnsupportedType({ text: 'hello' })).toBeNull()
  })

  it('returns null for photo message', () => {
    expect(getUnsupportedType({ photo: [{}] })).toBeNull()
  })

  it('returns null for document message', () => {
    expect(getUnsupportedType({ document: {} })).toBeNull()
  })

  it('detects voice', () => {
    expect(getUnsupportedType({ voice: {} })).toBe('voice')
  })

  it('detects video', () => {
    expect(getUnsupportedType({ video: {} })).toBe('video')
  })

  it('detects sticker', () => {
    expect(getUnsupportedType({ sticker: {} })).toBe('sticker')
  })
})

describe('extractAttachments', () => {
  it('returns empty for text-only message', () => {
    expect(extractAttachments({ text: 'hello' })).toEqual([])
  })

  it('extracts photo (largest size)', () => {
    const msg = {
      photo: [
        { file_id: 'small', file_size: 100 },
        { file_id: 'medium', file_size: 500 },
        { file_id: 'large', file_size: 2000 },
      ],
    }
    const result = extractAttachments(msg)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('photo')
    expect(result[0].fileId).toBe('large')
  })

  it('extracts document with metadata', () => {
    const msg = {
      document: {
        file_id: 'doc1',
        file_name: 'readme.pdf',
        mime_type: 'application/pdf',
        file_size: 12345,
      },
    }
    const result = extractAttachments(msg)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('document')
    expect(result[0].fileName).toBe('readme.pdf')
  })

  it('extracts both photo and document', () => {
    const msg = {
      photo: [{ file_id: 'p1', file_size: 100 }],
      document: { file_id: 'd1', file_size: 200 },
    }
    expect(extractAttachments(msg)).toHaveLength(2)
  })
})
