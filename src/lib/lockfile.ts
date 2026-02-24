import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'

export type LockEntry = {
  version: number
  hash: string
  updatedAt?: string
}

export type HarnessMode = 'symlink' | 'copy'

export const DEFAULT_HARNESS_MODE: HarnessMode = 'symlink'

export type LockFile = {
  schema: 1
  skills: Record<string, LockEntry>
  harnesses?: string[]
  harnessModes?: Record<string, HarnessMode>
}

export const createEmptyLockFile = (): LockFile => ({
  schema: 1,
  skills: {},
  harnesses: [],
  harnessModes: {},
})

const normalizeLockFile = (lockFile: Partial<LockFile>): LockFile => {
  const harnesses = Array.isArray(lockFile.harnesses)
    ? lockFile.harnesses.filter((h): h is string => typeof h === 'string')
    : []

  const harnessModesEntries = Object.entries(lockFile.harnessModes ?? {})
    .filter(([harnessId, mode]) =>
      typeof harnessId === 'string' && (mode === 'symlink' || mode === 'copy'),
    )

  const harnessModes = Object.fromEntries(harnessModesEntries) as Record<string, HarnessMode>

  return {
    schema: 1,
    skills: lockFile.skills ?? {},
    harnesses,
    harnessModes,
  }
}

export const readLockFile = (path: string): LockFile => {
  if (!existsSync(path)) {
    return createEmptyLockFile()
  }

  const content = readFileSync(path, 'utf-8')
  const parsed = JSON.parse(content) as Partial<LockFile>
  return normalizeLockFile(parsed)
}

export const writeLockFile = (path: string, lockFile: LockFile): void => {
  const dir = dirname(path)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const normalized = normalizeLockFile(lockFile)

  writeFileSync(path, JSON.stringify(normalized, null, 2) + '\n', 'utf-8')
}

export const setLockEntry = (
  lockFile: LockFile,
  skillId: string,
  entry: LockEntry,
): LockFile =>
  normalizeLockFile({
    ...lockFile,
    skills: {
      ...lockFile.skills,
      [skillId]: entry,
    },
  })

export const getHarnessMode = (lockFile: LockFile, harnessId: string): HarnessMode =>
  lockFile.harnessModes?.[harnessId] ?? DEFAULT_HARNESS_MODE

export const setHarnessMode = (
  lockFile: LockFile,
  harnessId: string,
  mode: HarnessMode,
): LockFile =>
  normalizeLockFile({
    ...lockFile,
    harnessModes: {
      ...(lockFile.harnessModes ?? {}),
      [harnessId]: mode,
    },
  })
