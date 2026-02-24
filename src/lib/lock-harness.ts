import {
  Dirent,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import { createHash } from 'crypto'
import { basename, dirname, extname, join, relative } from 'path'

import { SKILL_FILE, TOOLS, type ToolId } from '@/constants'
import { copySkillDir } from '@/lib/lock-copy'
import { getHarnessBaseDir } from '@/lib/harness'
import { type HarnessMode } from '@/lib/lockfile'
import { getProjectLockRoot, getLockSkillsPath } from '@/lib/lock-paths'
import { getSkillDir, getSkillFilePath, listSkillIds } from '@/lib/skill-fs'

const SYMLINK_UNSUPPORTED_CODES = new Set([
  'EPERM',
  'ENOTSUP',
  'EOPNOTSUPP',
  'EACCES',
  'EROFS',
])

type HarnessPathType = 'missing' | 'symlink' | 'file' | 'directory' | 'other'

export type HarnessContentStatus =
  | 'harness-synced'
  | 'harness-drifted'
  | 'missing'
  | 'conflict'

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

export type HarnessSyncResult = {
  total: number
  synced: number
  linked: number
  conflicts: number
  drifted: number
  fallbackToCopy: boolean
  mode: HarnessMode
}

export type HarnessImportResult = {
  total: number
  imported: number
  synced: number
  drifted: number
  conflicts: number
  fallbackToCopy: boolean
  mode: HarnessMode
}

export type HarnessStatusRow = {
  id: string
  status: HarnessContentStatus
}

export type HarnessStatusResult = {
  harness: ToolId
  mode: HarnessMode
  total: number
  synced: number
  drifted: number
  missing: number
  conflicts: number
  skills: HarnessStatusRow[]
}

type SyncOptions = {
  mode?: HarnessMode
  force?: boolean
  allowModeFallback?: boolean
}

const ensureDir = (path: string): void => {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true })
  }
}

const getPathType = (path: string): HarnessPathType => {
  try {
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) return 'symlink'
    if (stat.isDirectory()) return 'directory'
    if (stat.isFile()) return 'file'
    return 'other'
  } catch {
    return 'missing'
  }
}

const isSymlink = (path: string): boolean => getPathType(path) === 'symlink'

const readSymlinkTarget = (path: string): string | null => {
  try {
    return readlinkSync(path)
  } catch {
    return null
  }
}

const removePath = (path: string): void => {
  const type = getPathType(path)
  if (type === 'missing') return

  if (type === 'symlink') {
    unlinkSync(path)
    return
  }

  rmSync(path, { recursive: true, force: true })
}

const readDirEntries = (path: string): Dirent[] => {
  try {
    return readdirSync(path, { withFileTypes: true })
  } catch {
    return []
  }
}

const collectRegularFiles = (dir: string, baseDir = dir, acc: string[] = []): string[] | null => {
  const entries = readDirEntries(dir)

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    const relativePath = relative(baseDir, fullPath).replace(/\\/g, '/')

    if (entry.isDirectory()) {
      const nested = collectRegularFiles(fullPath, baseDir, acc)
      if (!nested) return null
      continue
    }

    if (!entry.isFile()) {
      return null
    }

    acc.push(relativePath)
  }

  return acc
}

const computeDirectoryFingerprint = (dir: string): string | null => {
  const pathType = getPathType(dir)
  if (pathType !== 'directory') return null

  const files = collectRegularFiles(dir)
  if (!files) return null

  const hash = createHash('sha256')
  for (const relativePath of files.sort((a, b) => a.localeCompare(b))) {
    const fullPath = join(dir, relativePath)
    const content = readFileSync(fullPath)
    hash.update(`${relativePath}\n`)
    hash.update(content)
  }

  return `sha256:${hash.digest('hex')}`
}

const filesEqual = (sourceFile: string, targetFile: string): boolean => {
  if (getPathType(sourceFile) !== 'file') return false
  if (getPathType(targetFile) !== 'file') return false

  const source = readFileSync(sourceFile)
  const target = readFileSync(targetFile)
  return source.equals(target)
}

const directoriesEqual = (sourceDir: string, targetDir: string): boolean => {
  const sourceFingerprint = computeDirectoryFingerprint(sourceDir)
  const targetFingerprint = computeDirectoryFingerprint(targetDir)

  if (!sourceFingerprint || !targetFingerprint) return false
  return sourceFingerprint === targetFingerprint
}

const isSymlinkUnsupportedError = (error: unknown): boolean => {
  const code = (error as { code?: string } | null)?.code
  if (!code) return false
  return SYMLINK_UNSUPPORTED_CODES.has(code)
}

const getHarnessEntryPath = (
  projectPath: string,
  harnessId: ToolId,
  skillId: string,
): string => {
  const tool = TOOLS[harnessId]
  const skillPath = join(projectPath, tool.skillPath(skillId))
  return tool.needsDirectory ? dirname(skillPath) : skillPath
}

const getHarnessTargetPath = (
  projectSkillsPath: string,
  harnessId: ToolId,
  skillId: string,
): string => {
  const tool = TOOLS[harnessId]
  return tool.needsDirectory
    ? getSkillDir(projectSkillsPath, skillId)
    : getSkillFilePath(projectSkillsPath, skillId)
}

const inspectSymlinkTarget = (entryPath: string, targetPath: string): HarnessContentStatus => {
  const pathType = getPathType(entryPath)
  if (pathType === 'missing') return 'missing'

  if (pathType !== 'symlink') {
    return 'harness-drifted'
  }

  const relativeTarget = relative(dirname(entryPath), targetPath)
  return readSymlinkTarget(entryPath) === relativeTarget ? 'harness-synced' : 'harness-drifted'
}

const inspectCopyTarget = (
  entryPath: string,
  targetPath: string,
  needsDirectory: boolean,
): HarnessContentStatus => {
  const pathType = getPathType(entryPath)
  if (pathType === 'missing') return 'missing'

  if (pathType === 'symlink') {
    return 'harness-drifted'
  }

  if (needsDirectory) {
    if (pathType !== 'directory') return 'conflict'
    return directoriesEqual(targetPath, entryPath) ? 'harness-synced' : 'harness-drifted'
  }

  if (pathType !== 'file') return 'conflict'
  return filesEqual(targetPath, entryPath) ? 'harness-synced' : 'harness-drifted'
}

const ensureSymlink = (
  symlinkPath: string,
  targetPath: string,
): { synced: boolean; conflict: boolean; unsupported: boolean; error?: string } => {
  ensureDir(dirname(symlinkPath))
  const relativeTarget = relative(dirname(symlinkPath), targetPath)

  if (existsSync(symlinkPath)) {
    if (isSymlink(symlinkPath)) {
      const currentTarget = readSymlinkTarget(symlinkPath)
      if (currentTarget === relativeTarget) {
        return { synced: true, conflict: false, unsupported: false }
      }
      unlinkSync(symlinkPath)
    } else {
      return { synced: false, conflict: true, unsupported: false }
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

const writeCopyTarget = (sourcePath: string, entryPath: string, needsDirectory: boolean): void => {
  ensureDir(dirname(entryPath))

  if (needsDirectory) {
    copySkillDir(sourcePath, entryPath)
    return
  }

  copyFileSync(sourcePath, entryPath)
}

const ensureCopy = (
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

const syncSkillToHarnessWithMode = (
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

  const symlinkResult = ensureSymlink(entryPath, targetPath)
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

const inspectHarnessSkill = (
  projectPath: string,
  harnessId: ToolId,
  skillId: string,
  mode: HarnessMode,
): HarnessContentStatus => {
  const projectSkillsPath = getLockSkillsPath(getProjectLockRoot(projectPath))
  const targetPath = getHarnessTargetPath(projectSkillsPath, harnessId, skillId)
  const entryPath = getHarnessEntryPath(projectPath, harnessId, skillId)

  if (!existsSync(targetPath)) return 'missing'

  if (mode === 'symlink') {
    return inspectSymlinkTarget(entryPath, targetPath)
  }

  return inspectCopyTarget(entryPath, targetPath, TOOLS[harnessId].needsDirectory)
}

const listHarnessSkills = (projectPath: string, harnessId: ToolId): string[] => {
  const baseDir = getHarnessBaseDir(projectPath, harnessId)
  if (!existsSync(baseDir)) return []

  if (TOOLS[harnessId].needsDirectory) {
    return listSkillIds(baseDir)
  }

  return readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .filter((entry) => extname(entry.name) === '.md')
    .map((entry) => basename(entry.name, '.md'))
    .sort()
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

export const syncHarnessSkills = (
  projectPath: string,
  harnessId: ToolId,
  options: SyncOptions = {},
): HarnessSyncResult => {
  const projectSkillsPath = getLockSkillsPath(getProjectLockRoot(projectPath))
  const skillIds = listSkillIds(projectSkillsPath)

  const initialMode = options.mode ?? 'symlink'
  if (skillIds.length === 0) {
    return {
      total: 0,
      synced: 0,
      linked: 0,
      conflicts: 0,
      drifted: 0,
      fallbackToCopy: false,
      mode: initialMode,
    }
  }

  let synced = 0
  let conflicts = 0
  let drifted = 0
  let fallbackToCopy = false
  let mode = initialMode

  for (const skillId of skillIds) {
    const result = syncSkillToHarnessWithMode(projectPath, harnessId, skillId, {
      ...options,
      mode,
    })

    if (result.synced) synced += 1
    if (result.conflict) conflicts += 1
    if (result.drifted) drifted += 1

    if (result.fallbackToCopy) {
      fallbackToCopy = true
      mode = 'copy'
    }
  }

  return {
    total: skillIds.length,
    synced,
    linked: synced,
    conflicts,
    drifted,
    fallbackToCopy,
    mode,
  }
}

export const importHarnessSkills = (
  projectPath: string,
  harnessId: ToolId,
  options: SyncOptions = {},
): HarnessImportResult => {
  const mode = options.mode ?? 'symlink'
  const tool = TOOLS[harnessId]
  const baseDir = getHarnessBaseDir(projectPath, harnessId)
  if (!existsSync(baseDir)) {
    return {
      total: 0,
      imported: 0,
      synced: 0,
      drifted: 0,
      conflicts: 0,
      fallbackToCopy: false,
      mode,
    }
  }

  const projectSkillsPath = getLockSkillsPath(getProjectLockRoot(projectPath))
  ensureDir(projectSkillsPath)

  const skillIds = listHarnessSkills(projectPath, harnessId)
  if (skillIds.length === 0) {
    return {
      total: 0,
      imported: 0,
      synced: 0,
      drifted: 0,
      conflicts: 0,
      fallbackToCopy: false,
      mode,
    }
  }

  let imported = 0
  let synced = 0
  let drifted = 0
  let conflicts = 0
  let fallbackToCopy = false
  let modeUsed = mode

  for (const skillId of skillIds) {
    const entryPath = getHarnessEntryPath(projectPath, harnessId, skillId)
    const entryType = getPathType(entryPath)

    if (entryType === 'missing') continue

    if (entryType !== 'symlink') {
      if (tool.needsDirectory) {
        const sourceDir = join(baseDir, skillId)
        const targetDir = getSkillDir(projectSkillsPath, skillId)
        copySkillDir(sourceDir, targetDir)
      } else {
        const sourceFile = join(baseDir, `${skillId}.md`)
        if (!existsSync(sourceFile)) continue
        const content = readFileSync(sourceFile, 'utf-8')
        const targetDir = getSkillDir(projectSkillsPath, skillId)
        ensureDir(targetDir)
        writeFileSync(join(targetDir, SKILL_FILE), content, 'utf-8')
      }

      imported += 1
    }

    if (modeUsed === 'symlink' && entryType !== 'symlink') {
      removePath(entryPath)
    }

    const syncResult = syncSkillToHarnessWithMode(projectPath, harnessId, skillId, {
      ...options,
      mode: modeUsed,
      force: true,
    })

    if (syncResult.synced) synced += 1
    if (syncResult.drifted) drifted += 1
    if (syncResult.conflict) conflicts += 1

    if (syncResult.fallbackToCopy) {
      fallbackToCopy = true
      modeUsed = 'copy'
    }
  }

  return {
    total: skillIds.length,
    imported,
    synced,
    drifted,
    conflicts,
    fallbackToCopy,
    mode: modeUsed,
  }
}

export const getHarnessStatus = (
  projectPath: string,
  harnessId: ToolId,
  mode: HarnessMode = 'symlink',
): HarnessStatusResult => {
  const projectSkillsPath = getLockSkillsPath(getProjectLockRoot(projectPath))
  const skillIds = listSkillIds(projectSkillsPath)

  const skills: HarnessStatusRow[] = []
  let synced = 0
  let drifted = 0
  let missing = 0
  let conflicts = 0

  for (const skillId of skillIds) {
    const status = inspectHarnessSkill(projectPath, harnessId, skillId, mode)
    skills.push({ id: skillId, status })

    if (status === 'harness-synced') synced += 1
    if (status === 'harness-drifted') drifted += 1
    if (status === 'missing') missing += 1
    if (status === 'conflict') conflicts += 1
  }

  return {
    harness: harnessId,
    mode,
    total: skillIds.length,
    synced,
    drifted,
    missing,
    conflicts,
    skills,
  }
}

export const removeHarnessSkills = (
  projectPath: string,
  harnessId: ToolId,
  mode: HarnessMode = 'symlink',
): number => {
  const projectSkillsPath = getLockSkillsPath(getProjectLockRoot(projectPath))
  const skillIds = listSkillIds(projectSkillsPath)
  if (skillIds.length === 0) return 0

  let removed = 0
  for (const skillId of skillIds) {
    if (removeSkillFromHarness(projectPath, harnessId, skillId, mode)) {
      removed += 1
    }
  }

  return removed
}

export const removeHarnessSymlinks = (projectPath: string, harnessId: ToolId): number =>
  removeHarnessSkills(projectPath, harnessId, 'symlink')
