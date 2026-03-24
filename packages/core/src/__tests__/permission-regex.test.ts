import { describe, it, expect } from 'vitest'
import { PERMISSION_REPLY_RE } from '../mcp-server.js'

// The permission reply regex: /^\s*(y|yes|n|no)\s+([a-km-z]{5})\s*$/i
// It matches a verdict (y/yes/n/no) followed by a 5-char code using letters a-z
// excluding 'l' (to avoid ambiguity with '1').

describe('Permission reply detection', () => {
  it('matches "yes abcde"', () => {
    expect(PERMISSION_REPLY_RE.test('yes abcde')).toBe(true)
  })

  it('matches "no abcde"', () => {
    expect(PERMISSION_REPLY_RE.test('no abcde')).toBe(true)
  })

  it('matches "y abcde"', () => {
    expect(PERMISSION_REPLY_RE.test('y abcde')).toBe(true)
  })

  it('matches "n abcde"', () => {
    expect(PERMISSION_REPLY_RE.test('n abcde')).toBe(true)
  })

  it('matches case-insensitively "YES ABCDE"', () => {
    expect(PERMISSION_REPLY_RE.test('YES ABCDE')).toBe(true)
  })

  it('matches with surrounding whitespace "  yes abcde  "', () => {
    expect(PERMISSION_REPLY_RE.test('  yes abcde  ')).toBe(true)
  })

  it('rejects codes containing "l" (e.g. "yes ablde")', () => {
    expect(PERMISSION_REPLY_RE.test('yes ablde')).toBe(false)
  })

  it('rejects codes that are too short (e.g. "yes abcd")', () => {
    expect(PERMISSION_REPLY_RE.test('yes abcd')).toBe(false)
  })

  it('rejects codes that are too long (e.g. "yes abcdef")', () => {
    expect(PERMISSION_REPLY_RE.test('yes abcdef')).toBe(false)
  })

  it('rejects codes with digits (e.g. "yes abc1e")', () => {
    expect(PERMISSION_REPLY_RE.test('yes abc1e')).toBe(false)
  })

  it('rejects regular messages (e.g. "hello world")', () => {
    expect(PERMISSION_REPLY_RE.test('hello world')).toBe(false)
  })

  it('rejects natural-language yes phrases (e.g. "yes please help me")', () => {
    expect(PERMISSION_REPLY_RE.test('yes please help me')).toBe(false)
  })
})
