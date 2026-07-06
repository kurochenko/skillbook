import { existsSync } from 'fs'

import { type ToolId } from '@/constants'
import { enabledHarnesses } from '@/lib/harness'
import { copySkillDir } from '@/lib/lock-copy'
import { getLibraryLockContext, getProjectLockContext } from '@/lib/lock-context'
import { linkSkillToHarness, removeSkillFromHarness } from '@/lib/lock-harness'
import { readLockFileOrFail } from '@/lib/lock-read'
import { resolveLockStatus } from '@/lib/lock-status'
import {
  getHarnessMode,
  setHarnessMode,
  setLockEntry,
  type LockFile,
  writeLockFile,
} from '@/lib/lockfile'
import { computeSkillHash } from '@/lib/skill-hash'
import { getSkillDir } from '@/lib/skill-fs'

export type HarnessSyncOperationResult = {
  lock: LockFile
  conflicts: number
  drifted: number
  fallbackHarnesses: ToolId[]
}

export type SkillOperationResult = {
  success: boolean
  error?: string
  alreadyUpToDate?: boolean
  exitCode?: number
  conflicts?: number
  drifted?: number
  fallbackHarnesses?: ToolId[]
}

export const syncSkillToHarnesses = (
  projectPath: string,
  skillId: string,
  lock: LockFile,
  harnesses: ToolId[] = enabledHarnesses(lock.harnesses),
): HarnessSyncOperationResult => {
  let conflicts = 0
  let drifted = 0
  let nextLock = lock
  const fallbackHarnesses: ToolId[] = []

  for (const harnessId of harnesses) {
    const result = linkSkillToHarness(projectPath, harnessId, skillId, {
      mode: getHarnessMode(nextLock, harnessId),
      force: true,
      allowModeFallback: true,
    })

    if (result.conflict) conflicts += 1
    if (result.drifted) drifted += 1

    if (result.fallbackToCopy && getHarnessMode(nextLock, harnessId) !== result.mode) {
      nextLock = setHarnessMode(nextLock, harnessId, result.mode)
      fallbackHarnesses.push(harnessId)
    }
  }

  return { lock: nextLock, conflicts, drifted, fallbackHarnesses }
}

export const removeSkillFromHarnesses = (
  projectPath: string,
  skillId: string,
  lock: LockFile,
  harnesses: ToolId[] = enabledHarnesses(lock.harnesses),
): void => {
  for (const harnessId of harnesses) {
    removeSkillFromHarness(projectPath, harnessId, skillId, getHarnessMode(lock, harnessId))
  }
}

export const installSkill = (
  skill: string,
  projectPath: string,
  force = false,
): SkillOperationResult => {
  const projectContext = getProjectLockContext(projectPath)
  const libraryContext = getLibraryLockContext()
  const projectSkillDir = getSkillDir(projectContext.skillsPath, skill)
  const librarySkillDir = getSkillDir(libraryContext.skillsPath, skill)

  if (!existsSync(librarySkillDir)) {
    return { success: false, error: `Skill not found in library: ${skill}` }
  }

  if (existsSync(projectSkillDir)) {
    if (force) {
      // Continue with overwriting
    } else {
      return { success: false, error: `Skill already exists in project: ${skill}. Use --force to overwrite.` }
    }
  }

  const libraryLock = readLockFileOrFail(libraryContext.lockFilePath)
  const entry = libraryLock.skills[skill]

  if (!entry) {
    return { success: false, error: `No lock entry found for skill in library: ${skill}` }
  }

  copySkillDir(librarySkillDir, projectSkillDir)

  const projectLock = readLockFileOrFail(projectContext.lockFilePath)
  const updated = setLockEntry(projectLock, skill, {
    version: entry.version,
    hash: entry.hash,
    updatedAt: entry.updatedAt,
  })
  writeLockFile(projectContext.lockFilePath, updated)

  const harnessSync = syncSkillToHarnesses(projectPath, skill, updated)

  if (harnessSync.fallbackHarnesses.length > 0) {
    writeLockFile(projectContext.lockFilePath, harnessSync.lock)
  }

  return {
    success: true,
    conflicts: harnessSync.conflicts,
    drifted: harnessSync.drifted,
    fallbackHarnesses: harnessSync.fallbackHarnesses,
  }
}

export const pullSkill = async (
  skill: string,
  projectPath: string,
): Promise<SkillOperationResult> => {
  const projectContext = getProjectLockContext(projectPath)
  const libraryContext = getLibraryLockContext()
  const projectSkillDir = getSkillDir(projectContext.skillsPath, skill)
  const librarySkillDir = getSkillDir(libraryContext.skillsPath, skill)

  if (!existsSync(librarySkillDir)) {
    return { success: false, error: `Skill not found in library: ${skill}`, exitCode: 1 }
  }

  const libraryLock = readLockFileOrFail(libraryContext.lockFilePath)
  const projectLock = readLockFileOrFail(projectContext.lockFilePath)
  const libraryEntry = libraryLock.skills[skill]
  const projectEntry = projectLock.skills[skill]

  if (!libraryEntry) {
    return { success: false, error: `No lock entry found for skill in library: ${skill}`, exitCode: 1 }
  }

  if (!existsSync(projectSkillDir)) {
    copySkillDir(librarySkillDir, projectSkillDir)
    const updatedLockEntry = setLockEntry(projectLock, skill, {
      version: libraryEntry.version,
      hash: libraryEntry.hash,
      updatedAt: libraryEntry.updatedAt,
    })

    const harnessSync = syncSkillToHarnesses(projectPath, skill, updatedLockEntry)
    writeLockFile(projectContext.lockFilePath, harnessSync.lock)

    return {
      success: true,
      conflicts: harnessSync.conflicts,
      drifted: harnessSync.drifted,
      fallbackHarnesses: harnessSync.fallbackHarnesses,
    }
  }

  if (!projectEntry) {
    return {
      success: false,
      error: `Skill '${skill}' is not linked to a lock entry. Run install instead.`,
      exitCode: 2,
    }
  }

  const projectHash = await computeSkillHash(projectSkillDir)
  const status = resolveLockStatus({ projectHash, projectEntry, libraryEntry })

  if (status === 'diverged') {
    return {
      success: false,
      error: `Skill '${skill}' has diverged. Resolve conflicts before pulling.`,
      exitCode: 2,
    }
  }

  if (status === 'ahead') {
    return { success: false, error: `Skill '${skill}' has local changes. Push before pulling.`, exitCode: 2 }
  }

  if (status === 'synced') {
    return { success: true, alreadyUpToDate: true }
  }

  copySkillDir(librarySkillDir, projectSkillDir)
  const updatedLockEntry = setLockEntry(projectLock, skill, {
    version: libraryEntry.version,
    hash: libraryEntry.hash,
    updatedAt: libraryEntry.updatedAt,
  })

  const harnessSync = syncSkillToHarnesses(projectPath, skill, updatedLockEntry)
  writeLockFile(projectContext.lockFilePath, harnessSync.lock)

  return {
    success: true,
    conflicts: harnessSync.conflicts,
    drifted: harnessSync.drifted,
    fallbackHarnesses: harnessSync.fallbackHarnesses,
  }
}

export const pushSkill = async (
  skill: string,
  projectPath: string,
): Promise<SkillOperationResult> => {
  const projectContext = getProjectLockContext(projectPath)
  const projectSkillDir = getSkillDir(projectContext.skillsPath, skill)

  if (!existsSync(projectSkillDir)) {
    return { success: false, error: `Skill not found in project: ${skill}`, exitCode: 1 }
  }

  const libraryContext = getLibraryLockContext()
  const librarySkillDir = getSkillDir(libraryContext.skillsPath, skill)

  const libraryLock = readLockFileOrFail(libraryContext.lockFilePath)
  const projectLock = readLockFileOrFail(projectContext.lockFilePath)
  const projectEntry = projectLock.skills[skill]
  const libraryEntry = libraryLock.skills[skill]

  const projectHash = await computeSkillHash(projectSkillDir)

  if (!projectEntry && libraryEntry) {
    return {
      success: false,
      error: `Skill '${skill}' exists in library but has no project lock entry. Install first.`,
      exitCode: 2,
    }
  }

  const projectChanged = projectEntry ? projectHash !== projectEntry.hash : true

  if (!libraryEntry) {
    const baseVersion = projectEntry?.version ?? 0
    const nextVersion = projectEntry
      ? projectChanged
        ? baseVersion + 1
        : Math.max(baseVersion, 1)
      : 1
    const nextEntry = { version: nextVersion, hash: projectHash, updatedAt: new Date().toISOString() }

    copySkillDir(projectSkillDir, librarySkillDir)
    writeLockFile(libraryContext.lockFilePath, setLockEntry(libraryLock, skill, nextEntry))
    writeLockFile(projectContext.lockFilePath, setLockEntry(projectLock, skill, nextEntry))

    return { success: true }
  }

  if (projectEntry) {
    const status = resolveLockStatus({ projectHash, projectEntry, libraryEntry })

    if (status === 'diverged') {
      return {
        success: false,
        error: `Skill '${skill}' has diverged. Resolve conflicts before pushing.`,
        exitCode: 2,
      }
    }

    if (status === 'behind') {
      return { success: false, error: `Skill '${skill}' is behind the library. Pull first.`, exitCode: 2 }
    }

    if (status === 'synced') {
      return { success: true, alreadyUpToDate: true }
    }
  }

  const nextVersion = libraryEntry.version + 1
  const nextEntry = { version: nextVersion, hash: projectHash, updatedAt: new Date().toISOString() }

  copySkillDir(projectSkillDir, librarySkillDir)

  const updatedLibraryLock = setLockEntry(libraryLock, skill, nextEntry)
  writeLockFile(libraryContext.lockFilePath, updatedLibraryLock)

  const updatedProjectLock = setLockEntry(projectLock, skill, nextEntry)
  writeLockFile(projectContext.lockFilePath, updatedProjectLock)

  return { success: true }
}
