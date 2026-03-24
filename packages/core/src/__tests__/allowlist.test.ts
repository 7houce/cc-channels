import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Allowlist } from '../allowlist.js'
import { writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('Allowlist', () => {
  const testDir = join(tmpdir(), 'allowlist-test-' + Date.now())
  let allowlist: Allowlist

  beforeEach(async () => {
    const { mkdirSync } = await import('node:fs')
    mkdirSync(testDir, { recursive: true })
    allowlist = new Allowlist(join(testDir, 'allowlist.json'))
  })

  afterEach(() => {
    const path = join(testDir, 'allowlist.json')
    if (existsSync(path)) unlinkSync(path)
  })

  it('starts with empty allowlist', () => {
    expect(allowlist.isAllowed('12345')).toBe(false)
  })

  it('loads existing allowlist from disk', () => {
    writeFileSync(
      join(testDir, 'allowlist.json'),
      JSON.stringify({ allowed_users: [{ user_id: '111', name: 'Tom', paired_at: '2026-01-01' }] })
    )
    const al = new Allowlist(join(testDir, 'allowlist.json'))
    expect(al.isAllowed('111')).toBe(true)
  })

  it('adds user and persists to disk', () => {
    allowlist.addUser('222', 'Jerry')
    expect(allowlist.isAllowed('222')).toBe(true)
    // Reload from disk
    const al2 = new Allowlist(join(testDir, 'allowlist.json'))
    expect(al2.isAllowed('222')).toBe(true)
  })

  it('generates pairing code', () => {
    const code = allowlist.generatePairingCode()
    expect(code).toHaveLength(6)
    expect(/^[A-Z0-9]{6}$/.test(code)).toBe(true)
  })

  it('validates correct pairing code', () => {
    const code = allowlist.generatePairingCode()
    expect(allowlist.validatePairingCode(code)).toBe(true)
  })

  it('rejects wrong pairing code', () => {
    allowlist.generatePairingCode()
    expect(allowlist.validatePairingCode('WRONG1')).toBe(false)
  })

  it('invalidates code after successful validation', () => {
    const code = allowlist.generatePairingCode()
    expect(allowlist.validatePairingCode(code)).toBe(true)
    expect(allowlist.validatePairingCode(code)).toBe(false) // second attempt fails
  })

  it('rejects expired pairing code', async () => {
    const code = allowlist.generatePairingCode(50) // 50ms TTL
    await new Promise(r => setTimeout(r, 100))
    expect(allowlist.validatePairingCode(code)).toBe(false)
  })
})
