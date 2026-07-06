import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import { validateExistingSkillName } from '@/lib/skills'

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

export class LockFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LockFileError'
  }
}

export const createEmptyLockFile = (): LockFile => ({
  schema: 1,
  skills: {},
  harnesses: [],
  harnessModes: {},
})

export const normalizeLockFile = (lockFile: Partial<LockFile>): LockFile => {
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

const describeEntryPath = (skillId: string, field: string): string =>
  `skill "${skillId}" ${field}`

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const failValidation = (path: string, detail: string): never => {
  throw new LockFileError(
    `Invalid lock file at ${path}: ${detail}. Fix or delete the file and re-run 'skillbook migrate'.`,
  )
}

export const validateLockFile = (parsed: unknown, path: string): Partial<LockFile> => {
  if (!isRecord(parsed)) {
    failValidation(path, 'expected a JSON object')
  }

  const skills = parsed.skills
  if (skills !== undefined && !isRecord(skills)) {
    failValidation(path, 'skills must be an object')
  }

  for (const [skillId, entry] of Object.entries(skills ?? {})) {
    const validation = validateExistingSkillName(skillId)
    if (!validation.valid) {
      failValidation(path, `invalid skill id "${skillId}": ${validation.error}`)
    }

    if (!isRecord(entry)) {
      failValidation(path, `skill "${skillId}" must be an object`)
    }

    if (
      typeof entry.version !== 'number' ||
      !Number.isFinite(entry.version) ||
      !Number.isInteger(entry.version) ||
      entry.version < 1
    ) {
      failValidation(path, `${describeEntryPath(skillId, 'version')} must be an integer >= 1`)
    }

    if (typeof entry.hash !== 'string' || entry.hash.length === 0) {
      failValidation(path, `${describeEntryPath(skillId, 'hash')} must be a non-empty string`)
    }

    if (entry.updatedAt !== undefined && typeof entry.updatedAt !== 'string') {
      failValidation(path, `${describeEntryPath(skillId, 'updatedAt')} must be a string`)
    }
  }

  return parsed as Partial<LockFile>
}

export const readLockFile = (path: string): LockFile => {
  if (!existsSync(path)) {
    return createEmptyLockFile()
  }

  const content = readFileSync(path, 'utf-8')
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new LockFileError(
      `Invalid lock file at ${path}: ${message}. Fix or delete the file and re-run 'skillbook migrate'.`,
    )
  }

  return normalizeLockFile(validateLockFile(parsed, path))
}

export const writeLockFile = (path: string, lockFile: LockFile): void => {
  const dir = dirname(path)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const normalized = normalizeLockFile(lockFile)

  const tempPath = `${path}.tmp.${process.pid}`
  try {
    writeFileSync(tempPath, JSON.stringify(normalized, null, 2) + '\n', 'utf-8')
    renameSync(tempPath, path)
  } catch (error) {
    rmSync(tempPath, { force: true })
    throw error
  }
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
