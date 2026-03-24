import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { AllowlistData, AllowedUser, PairingCode } from './types.js'
import { logger } from './logger.js'

const PAIRING_CODE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I/l ambiguity

export class Allowlist {
  private users: Map<string, AllowedUser> = new Map()
  private filePath: string
  private pairingCode: PairingCode | null = null

  constructor(filePath: string) {
    this.filePath = filePath
    this.load()
  }

  isAllowed(userId: string): boolean {
    return this.users.has(userId)
  }

  hasAnyUsers(): boolean {
    return this.users.size > 0
  }

  addUser(userId: string, name: string): void {
    const user: AllowedUser = {
      user_id: userId,
      name,
      paired_at: new Date().toISOString(),
    }
    this.users.set(userId, user)
    this.save()
    logger.info(`User paired: ${name} (${userId})`)
  }

  generatePairingCode(ttlMs: number = PAIRING_CODE_TTL_MS): string {
    const code = Array.from({ length: 6 }, () =>
      CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
    ).join('')
    this.pairingCode = { code, expiresAt: Date.now() + ttlMs }
    return code
  }

  validatePairingCode(code: string): boolean {
    if (!this.pairingCode) return false
    if (this.pairingCode.code !== code.toUpperCase()) return false
    if (Date.now() > this.pairingCode.expiresAt) {
      this.pairingCode = null
      return false
    }
    this.pairingCode = null // one-time use
    return true
  }

  private load(): void {
    if (!existsSync(this.filePath)) return
    try {
      const data: AllowlistData = JSON.parse(readFileSync(this.filePath, 'utf-8'))
      for (const user of data.allowed_users) {
        this.users.set(user.user_id, user)
      }
      logger.info(`Loaded ${this.users.size} allowed user(s)`)
    } catch (err) {
      logger.error(`Failed to load allowlist: ${err}`)
    }
  }

  private save(): void {
    const data: AllowlistData = {
      allowed_users: [...this.users.values()],
    }
    writeFileSync(this.filePath, JSON.stringify(data, null, 2))
  }
}
