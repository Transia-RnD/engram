/**
 * Minimal logger interface for Engram.
 *
 * Engram is a library — it does not own logging infrastructure.
 * Consumers inject their own logger via EngramConfig. The default
 * is a no-op logger so the library is silent unless explicitly wired.
 */
export interface EngramLogger {
  warn(tag: string, message: string, data?: Record<string, unknown>): void
  error(tag: string, message: string, data?: Record<string, unknown>): void
  debug(tag: string, message: string, data?: Record<string, unknown>): void
}

export const NOOP_LOGGER: EngramLogger = {
  warn: () => {},
  error: () => {},
  debug: () => {},
}

export const CONSOLE_LOGGER: EngramLogger = {
  warn: (tag, message, data) => console.warn(`[engram:${tag}] ${message}`, data ?? ''),
  error: (tag, message, data) => console.error(`[engram:${tag}] ${message}`, data ?? ''),
  debug: (tag, message, data) => console.debug(`[engram:${tag}] ${message}`, data ?? ''),
}
