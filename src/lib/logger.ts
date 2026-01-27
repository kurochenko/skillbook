import { appendFileSync, existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { getLibraryPath } from '@/lib/paths'

type LogLevel = 'info' | 'warn' | 'error'

export type LogContext = Record<string, unknown>

type LoggerConfig = {
  logToFile: boolean
  logToStderr: boolean
  logFilePath: string
}

let loggerConfig: LoggerConfig | null = null

const getDefaultLogPath = (): string =>
  join(getLibraryPath(), 'logs', 'skillbook.log')

export const initLogger = (options: {
  logToFile: boolean
  logToStderr: boolean
  logFilePath?: string
}): void => {
  const { logToFile, logToStderr, logFilePath } = options

  if (!logToFile && !logToStderr) {
    loggerConfig = null
    return
  }

  loggerConfig = {
    logToFile,
    logToStderr,
    logFilePath: logFilePath ?? getDefaultLogPath(),
  }
}

export const isLoggingEnabled = (): boolean =>
  Boolean(loggerConfig && (loggerConfig.logToFile || loggerConfig.logToStderr))

const ensureLogDir = (filePath: string): void => {
  const dir = dirname(filePath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

const toErrorInfo = (error: unknown): { message: string; stack?: string; code?: string } => {
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code
    return { message: error.message, stack: error.stack, code }
  }

  return { message: String(error) }
}

const writeLog = (level: LogLevel, message: string, context?: LogContext, error?: unknown): void => {
  if (!loggerConfig) return

  const entry: {
    ts: string
    level: LogLevel
    message: string
    context?: LogContext
    error?: { message: string; stack?: string; code?: string }
  } = {
    ts: new Date().toISOString(),
    level,
    message,
  }

  if (context && Object.keys(context).length > 0) {
    entry.context = context
  }

  if (error !== undefined) {
    entry.error = toErrorInfo(error)
  }

  const line = JSON.stringify(entry)

  if (loggerConfig.logToFile) {
    try {
      ensureLogDir(loggerConfig.logFilePath)
      appendFileSync(loggerConfig.logFilePath, `${line}\n`, 'utf-8')
    } catch {
      // ignore logging failures
    }
  }

  if (loggerConfig.logToStderr) {
    try {
      process.stderr.write(`${line}\n`)
    } catch {
      // ignore logging failures
    }
  }
}

export const logInfo = (message: string, context?: LogContext): void =>
  writeLog('info', message, context)

export const logWarn = (message: string, error?: unknown, context?: LogContext): void =>
  writeLog('warn', message, context, error)

export const logError = (message: string, error?: unknown, context?: LogContext): void =>
  writeLog('error', message, context, error)

export const isIgnoredFsError = (error: unknown): boolean => {
  if (isLoggingEnabled()) return false
  if (!error || typeof error !== 'object') return false
  const code = (error as NodeJS.ErrnoException).code
  return code === 'ENOENT' || code === 'ENOTDIR'
}
