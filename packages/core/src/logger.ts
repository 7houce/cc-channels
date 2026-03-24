type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

let minLevel: LogLevel = 'info'

export function setLogLevel(level: LogLevel): void {
  minLevel = level
}

function log(level: LogLevel, message: string): void {
  if (LEVELS[level] < LEVELS[minLevel]) return
  const ts = new Date().toISOString()
  process.stderr.write(`[${ts}] [${level.toUpperCase()}] ${message}\n`)
}

export const logger = {
  debug: (msg: string) => log('debug', msg),
  info: (msg: string) => log('info', msg),
  warn: (msg: string) => log('warn', msg),
  error: (msg: string) => log('error', msg),
}
