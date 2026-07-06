import pc from 'picocolors'
import { LockFileError, readLockFile, type LockFile } from '@/lib/lockfile'

export type LockReadFailOptions = {
  json?: boolean
  payload?: Record<string, unknown>
}

export const readLockFileOrFail = (path: string, options: LockReadFailOptions = {}): LockFile => {
  try {
    return readLockFile(path)
  } catch (error) {
    if (error instanceof LockFileError) {
      if (options.json) {
        process.stdout.write(JSON.stringify({ ...options.payload, ok: false, error: error.message }))
      } else {
        process.stderr.write(`${pc.red(error.message)}\n`)
      }
      process.exit(1)
    }
    throw error
  }
}
