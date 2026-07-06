import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'fs'
import { basename, extname, join } from 'path'

import { SKILL_FILE, TOOLS, type ToolId } from '@/constants'
import { getHarnessBaseDir } from '@/lib/harness'
import {
  getPathType,
  inspectCopyTarget,
  inspectOrphanHarnessEntry,
  inspectSymlinkTarget,
  type HarnessContentStatus,
} from '@/lib/harness-inspect'
import {
  ensureDir,
  getHarnessEntryPath,
  getHarnessTargetPath,
  removePath,
  removeSkillFromHarness,
  syncSkillToHarnessWithMode,
} from '@/lib/harness-link'
import { copySkillDir } from '@/lib/lock-copy'
import { type HarnessMode } from '@/lib/lockfile'
import { getProjectLockRoot, getLockSkillsPath } from '@/lib/paths'
import { getSkillDir, listSkillIds } from '@/lib/skill-fs'

export type HarnessSyncResult = {
  total: number
  synced: number
  linked: number
  conflicts: number
  drifted: number
  removedStale: number
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
  stale: number
  untracked: number
  skills: HarnessStatusRow[]
}

type SyncOptions = {
  mode?: HarnessMode
  force?: boolean
  allowModeFallback?: boolean
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

export const listHarnessSkills = (projectPath: string, harnessId: ToolId): string[] => {
  const baseDir = getHarnessBaseDir(projectPath, harnessId)
  if (!existsSync(baseDir)) return []

  if (TOOLS[harnessId].needsDirectory) {
    return readdirSync(baseDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => entry.name)
      .sort()
  }

  return readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() || entry.isSymbolicLink())
    .filter((entry) => extname(entry.name) === '.md')
    .map((entry) => basename(entry.name, '.md'))
    .sort()
}

export const removeStaleHarnessEntries = (
  projectPath: string,
  harnessId: ToolId,
  projectSkillIds: Set<string>,
): number => {
  const projectSkillsPath = getLockSkillsPath(getProjectLockRoot(projectPath))
  let removed = 0

  for (const skillId of listHarnessSkills(projectPath, harnessId)) {
    if (projectSkillIds.has(skillId)) continue

    const entryPath = getHarnessEntryPath(projectPath, harnessId, skillId)
    if (inspectOrphanHarnessEntry(entryPath, projectSkillsPath) !== 'stale') continue

    removePath(entryPath)
    removed += 1
  }

  return removed
}

export const syncHarnessSkills = (
  projectPath: string,
  harnessId: ToolId,
  options: SyncOptions = {},
): HarnessSyncResult => {
  const projectSkillsPath = getLockSkillsPath(getProjectLockRoot(projectPath))
  const skillIds = listSkillIds(projectSkillsPath)
  const skillIdSet = new Set(skillIds)

  const initialMode = options.mode ?? 'symlink'
  if (skillIds.length === 0) {
    const removedStale = removeStaleHarnessEntries(projectPath, harnessId, skillIdSet)
    return {
      total: 0,
      synced: 0,
      linked: 0,
      conflicts: 0,
      drifted: 0,
      removedStale,
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

  const removedStale = removeStaleHarnessEntries(projectPath, harnessId, skillIdSet)

  return {
    total: skillIds.length,
    synced,
    linked: synced,
    conflicts,
    drifted,
    removedStale,
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
        if (!existsSync(join(sourceDir, SKILL_FILE))) continue
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
  let stale = 0
  let untracked = 0

  for (const skillId of skillIds) {
    const status = inspectHarnessSkill(projectPath, harnessId, skillId, mode)
    skills.push({ id: skillId, status })

    if (status === 'harness-synced') synced += 1
    if (status === 'harness-drifted') drifted += 1
    if (status === 'missing') missing += 1
    if (status === 'conflict') conflicts += 1
  }

  const projectSkillIds = new Set(skillIds)
  for (const skillId of listHarnessSkills(projectPath, harnessId)) {
    if (projectSkillIds.has(skillId)) continue

    const entryPath = getHarnessEntryPath(projectPath, harnessId, skillId)
    const status = inspectOrphanHarnessEntry(entryPath, projectSkillsPath)
    skills.push({ id: skillId, status })

    if (status === 'stale') stale += 1
    if (status === 'untracked') untracked += 1
  }

  return {
    harness: harnessId,
    mode,
    total: skills.length,
    synced,
    drifted,
    missing,
    conflicts,
    stale,
    untracked,
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
