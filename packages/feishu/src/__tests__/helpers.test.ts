import { describe, it, expect } from 'vitest'
import { getUnsupportedType, extractAttachments, extractTextContent } from '../helpers.js'

describe('getUnsupportedType', () => {
  it('returns null for text', () => { expect(getUnsupportedType('text')).toBeNull() })
  it('returns null for image', () => { expect(getUnsupportedType('image')).toBeNull() })
  it('returns null for file', () => { expect(getUnsupportedType('file')).toBeNull() })
  it('detects audio', () => { expect(getUnsupportedType('audio')).toBe('audio') })
  it('detects sticker', () => { expect(getUnsupportedType('sticker')).toBe('sticker') })
  it('detects share_chat', () => { expect(getUnsupportedType('share_chat')).toBe('share_chat') })
})

describe('extractAttachments', () => {
  it('returns empty for text', () => { expect(extractAttachments('text', { text: 'hi' })).toEqual([]) })
  it('extracts image', () => {
    const result = extractAttachments('image', { image_key: 'img_xxx' })
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('photo')
    expect(result[0].fileId).toBe('img_xxx')
  })
  it('extracts file', () => {
    const result = extractAttachments('file', { file_key: 'file_xxx', file_name: 'doc.pdf' })
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('document')
    expect(result[0].fileName).toBe('doc.pdf')
  })
})

describe('extractTextContent', () => {
  it('extracts text from text message', () => {
    expect(extractTextContent('text', { text: 'hello' })).toBe('hello')
  })
  it('extracts text from post message', () => {
    const content = {
      zh_cn: {
        title: 'Title',
        content: [[{ tag: 'text', text: 'hello ' }, { tag: 'text', text: 'world' }]]
      }
    }
    expect(extractTextContent('post', content)).toBe('hello world')
  })
  it('returns empty for image', () => {
    expect(extractTextContent('image', { image_key: 'xxx' })).toBe('')
  })
})
