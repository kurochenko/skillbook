import {
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from 'fs'
import { dirname, join, relative } from 'path'

import { TOOLS, type ToolId } from '@/constants'
import {
  getPathType,
  inspectCopyTarget,
  readSymlinkTarget,
  type HarnessContentStatus,
} from '@/lib/harness-inspect'
import { copySkillDir } from '@/lib/lock-copy'
import { type HarnessMode } from '@/lib/lockfile'
import { getProjectLockRoot, getLockSkillsPath } from '@/lib/paths'
import { getSkillDir, getSkillFilePath } from '@/lib/skill-fs'

export const SYMLINK_UNSUPPORTED_CODES = new Set([
  'EPERM',
  'ENOTSUP',
  'EOPNOTSUPP',
  'EACCES',
  'EROFS',
])

export type HarnessSyncSkillResult = {
  synced: boolean
  conflict: boolean
  drifted: boolean
  fallbackToCopy: boolean
  mode: HarnessMode
  status: HarnessContentStatus
  error?: string
}

export type HarnessLinkResult = {
  linked: boolean
  conflict: boolean
  fallbackToCopy: boolean
  mode: HarnessMode
  drifted: boolean
}

type SyncOptions = {
  mode?: HarnessMode
  force?: boolean
  allowModeFallback?: boolean
}

export const ensureDir = (path: string): void => {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true })
  }
}

export const removePath = (path: string): void => {
  const type = getPathType(path)
  if (type === 'missing') return

  if (type === 'symlink') {
    unlinkSync(path)
    return
  }

  rmSync(path, { recursive: true, force: true })
}

export const isSymlinkUnsupportedError = (error: unknown): boolean => {
  const code = (error as { code?: string } | null)?.code
  if (!code) return false
  return SYMLINK_UNSUPPORTED_CODES.has(code)
}

export const getHarnessEntryPath = (
  projectPath: string,
  harnessId: ToolId,
  skillId: string,
): string => {
  const tool = TOOLS[harnessId]
  const skillPath = join(projectPath, tool.skillPath(skillId))
  return tool.needsDirectory ? dirname(skillPath) : skillPath
}

export const getHarnessTargetPath = (
  projectSkillsPath: string,
  harnessId: ToolId,
  skillId: string,
): string => {
  const tool = TOOLS[harnessId]
  return tool.needsDirectory
    ? getSkillDir(projectSkillsPath, skillId)
    : getSkillFilePath(projectSkillsPath, skillId)
}

export const ensureSymlink = (
  symlinkPath: string,
  targetPath: string,
  force = false,
): { synced: boolean; conflict: boolean; unsupported: boolean; error?: string } => {
  ensureDir(dirname(symlinkPath))
  const relativeTarget = relative(dirname(symlinkPath), targetPath)
  const pathType = getPathType(symlinkPath)

  if (pathType !== 'missing') {
    if (pathType === 'symlink') {
      const currentTarget = readSymlinkTarget(symlinkPath)
      if (currentTarget === relativeTarget) {
        return { synced: true, conflict: false, unsupported: false }
      }
      unlinkSync(symlinkPath)
    } else {
      if (force) {
        removePath(symlinkPath)
      } else {
        return { synced: false, conflict: true, unsupported: false }
      }
    }
  }

  try {
    symlinkSync(relativeTarget, symlinkPath)
    return { synced: true, conflict: false, unsupported: false }
  } catch (error) {
    if (isSymlinkUnsupportedError(error)) {
      return { synced: false, conflict: false, unsupported: true }
    }

    const message = error instanceof Error ? error.message : 'Failed to create symlink'
    return { synced: false, conflict: true, unsupported: false, error: message }
  }
}

export const writeCopyTarget = (sourcePath: string, entryPath: string, needsDirectory: boolean): void => {
  ensureDir(dirname(entryPath))

  if (needsDirectory) {
    copySkillDir(sourcePath, entryPath)
    return
  }

  copyFileSync(sourcePath, entryPath)
}

export const ensureCopy = (
  entryPath: string,
  targetPath: string,
  needsDirectory: boolean,
  force = false,
): HarnessSyncSkillResult => {
  const targetType = getPathType(targetPath)
  if (targetType === 'missing') {
    return {
      synced: false,
      conflict: false,
      drifted: false,
      fallbackToCopy: false,
      mode: 'copy',
      status: 'missing',
    }
  }

  const status = inspectCopyTarget(entryPath, targetPath, needsDirectory)
  if (status === 'harness-synced') {
    return {
      synced: true,
      conflict: false,
      drifted: false,
      fallbackToCopy: false,
      mode: 'copy',
      status,
    }
  }

  if (status === 'conflict') {
    return {
      synced: false,
      conflict: true,
      drifted: false,
      fallbackToCopy: false,
      mode: 'copy',
      status,
    }
  }

  if (status === 'harness-drifted' && !force) {
    return {
      synced: false,
      conflict: false,
      drifted: true,
      fallbackToCopy: false,
      mode: 'copy',
      status,
    }
  }

  removePath(entryPath)
  writeCopyTarget(targetPath, entryPath, needsDirectory)

  return {
    synced: true,
    conflict: false,
    drifted: false,
    fallbackToCopy: false,
    mode: 'copy',
    status: 'harness-synced',
  }
}

export const syncSkillToHarnessWithMode = (
  projectPath: string,
  harnessId: ToolId,
  skillId: string,
  options: SyncOptions = {},
): HarnessSyncSkillResult => {
  const mode = options.mode ?? 'symlink'
  const force = options.force ?? false
  const allowModeFallback = options.allowModeFallback ?? false

  const projectSkillsPath = getLockSkillsPath(getProjectLockRoot(projectPath))
  const targetPath = getHarnessTargetPath(projectSkillsPath, harnessId, skillId)
  const entryPath = getHarnessEntryPath(projectPath, harnessId, skillId)
  const tool = TOOLS[harnessId]

  if (!existsSync(targetPath)) {
    return {
      synced: false,
      conflict: false,
      drifted: false,
      fallbackToCopy: false,
      mode,
      status: 'missing',
    }
  }

  if (mode === 'copy') {
    return ensureCopy(entryPath, targetPath, tool.needsDirectory, force)
  }

  const symlinkResult = ensureSymlink(entryPath, targetPath, force)
  if (symlinkResult.synced) {
    return {
      synced: true,
      conflict: false,
      drifted: false,
      fallbackToCopy: false,
      mode: 'symlink',
      status: 'harness-synced',
    }
  }

  if (symlinkResult.unsupported && allowModeFallback) {
    const copied = ensureCopy(entryPath, targetPath, tool.needsDirectory, force)
    return {
      ...copied,
      fallbackToCopy: true,
      mode: 'copy',
    }
  }

  const status = symlinkResult.conflict ? 'conflict' : 'harness-drifted'
  return {
    synced: false,
    conflict: symlinkResult.conflict,
    drifted: false,
    fallbackToCopy: false,
    mode: 'symlink',
    status,
    error: symlinkResult.error,
  }
}

export const linkSkillToHarness = (
  projectPath: string,
  harnessId: ToolId,
  skillId: string,
  options: SyncOptions = {},
): HarnessLinkResult => {
  const result = syncSkillToHarnessWithMode(projectPath, harnessId, skillId, options)
  return {
    linked: result.synced,
    conflict: result.conflict,
    fallbackToCopy: result.fallbackToCopy,
    mode: result.mode,
    drifted: result.drifted,
  }
}

export const removeSkillFromHarness = (
  projectPath: string,
  harnessId: ToolId,
  skillId: string,
  mode: HarnessMode = 'symlink',
): boolean => {
  const entryPath = getHarnessEntryPath(projectPath, harnessId, skillId)
  const pathType = getPathType(entryPath)
  if (pathType === 'missing') return false

  if (mode === 'symlink') {
    if (pathType !== 'symlink') return false
    unlinkSync(entryPath)
    return true
  }

  removePath(entryPath)
  return true
}

export const unlinkSkillFromHarness = (
  projectPath: string,
  harnessId: ToolId,
  skillId: string,
): boolean => removeSkillFromHarness(projectPath, harnessId, skillId, 'symlink')
