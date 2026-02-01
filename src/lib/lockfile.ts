import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'

export type LockEntry = {
  version: number
  hash: string
  updatedAt?: string
}

export type LockFile = {
  schema: 1
  skills: Record<string, LockEntry>
  harnesses?: string[]
}

export const createEmptyLockFile = (): LockFile => ({
  schema: 1,
  skills: {},
  harnesses: [],
})

export const readLockFile = (path: string): LockFile => {
  if (!existsSync(path)) {
    return createEmptyLockFile()
  }

  const content = readFileSync(path, 'utf-8')
  const parsed = JSON.parse(content) as Partial<LockFile>
  const harnesses = Array.isArray(parsed.harnesses)
    ? parsed.harnesses.filter((h): h is string => typeof h === 'string')
    : []

  return {
    schema: parsed.schema === 1 ? 1 : 1,
    skills: parsed.skills ?? {},
    harnesses,
  }
}

export const writeLockFile = (path: string, lockFile: LockFile): void => {
  const dir = dirname(path)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const normalized: LockFile = {
    schema: 1,
    skills: lockFile.skills ?? {},
    harnesses: lockFile.harnesses ?? [],
  }

  writeFileSync(path, JSON.stringify(normalized, null, 2) + '\n', 'utf-8')
}

export const setLockEntry = (
  lockFile: LockFile,
  skillId: string,
  entry: LockEntry,
): LockFile => ({
  schema: 1,
  skills: {
    ...lockFile.skills,
    [skillId]: entry,
  },
  harnesses: lockFile.harnesses ?? [],
})
