import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  lstatSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
  rmSync,
} from 'fs'
import { join, dirname, extname, basename, relative } from 'path'
import { SKILL_FILE, TOOLS, type ToolId } from '@/constants'
import { copySkillDir } from '@/lib/lock-copy'
import { getLockSkillsPath, getProjectLockRoot } from '@/lib/lock-paths'
import { getHarnessBaseDir } from '@/lib/harness'

const ensureDir = (path: string) => {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true })
  }
}

const isSymlink = (path: string) => {
  try {
    return lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}

const readSymlinkTarget = (path: string) => {
  try {
    return readlinkSync(path)
  } catch {
    return null
  }
}

const removePath = (path: string) => {
  if (!existsSync(path)) return
  if (isSymlink(path)) {
    unlinkSync(path)
    return
  }
  rmSync(path, { recursive: true, force: true })
}

const getHarnessSymlinkPath = (projectPath: string, harnessId: ToolId, skillId: string) => {
  const tool = TOOLS[harnessId]
  const skillPath = join(projectPath, tool.skillPath(skillId))
  return tool.needsDirectory ? dirname(skillPath) : skillPath
}

const getHarnessTargetPath = (projectSkillsPath: string, harnessId: ToolId, skillId: string) => {
  const tool = TOOLS[harnessId]
  return tool.needsDirectory
    ? join(projectSkillsPath, skillId)
    : join(projectSkillsPath, skillId, SKILL_FILE)
}

const ensureSymlink = (
  symlinkPath: string,
  targetPath: string,
): { linked: boolean; conflict: boolean } => {
  ensureDir(dirname(symlinkPath))
  const relativeTarget = relative(dirname(symlinkPath), targetPath)

  if (existsSync(symlinkPath)) {
    if (isSymlink(symlinkPath)) {
      const currentTarget = readSymlinkTarget(symlinkPath)
      if (currentTarget === relativeTarget) {
        return { linked: true, conflict: false }
      }
      unlinkSync(symlinkPath)
    } else {
      return { linked: false, conflict: true }
    }
  }

  symlinkSync(relativeTarget, symlinkPath)
  return { linked: true, conflict: false }
}

export type HarnessLinkResult = { linked: boolean; conflict: boolean }

export const linkSkillToHarness = (
  projectPath: string,
  harnessId: ToolId,
  skillId: string,
): HarnessLinkResult => {
  const projectSkillsPath = getLockSkillsPath(getProjectLockRoot(projectPath))
  const targetPath = getHarnessTargetPath(projectSkillsPath, harnessId, skillId)
  const symlinkPath = getHarnessSymlinkPath(projectPath, harnessId, skillId)

  if (!existsSync(targetPath)) {
    return { linked: false, conflict: false }
  }

  return ensureSymlink(symlinkPath, targetPath)
}

export const unlinkSkillFromHarness = (
  projectPath: string,
  harnessId: ToolId,
  skillId: string,
): boolean => {
  const symlinkPath = getHarnessSymlinkPath(projectPath, harnessId, skillId)
  if (!isSymlink(symlinkPath)) return false
  unlinkSync(symlinkPath)
  return true
}

const listProjectSkills = (projectSkillsPath: string): string[] => {
  if (!existsSync(projectSkillsPath)) return []

  return readdirSync(projectSkillsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => existsSync(join(projectSkillsPath, entry.name, SKILL_FILE)))
    .map((entry) => entry.name)
    .sort()
}

const listHarnessSkills = (projectPath: string, harnessId: ToolId): string[] => {
  const baseDir = getHarnessBaseDir(projectPath, harnessId)
  if (!existsSync(baseDir)) return []

  if (TOOLS[harnessId].needsDirectory) {
    return readdirSync(baseDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => existsSync(join(baseDir, entry.name, SKILL_FILE)))
      .map((entry) => entry.name)
      .sort()
  }

  return readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .filter((entry) => extname(entry.name) === '.md')
    .map((entry) => basename(entry.name, '.md'))
    .sort()
}

export type HarnessSyncResult = {
  total: number
  linked: number
  conflicts: number
}

export const syncHarnessSkills = (
  projectPath: string,
  harnessId: ToolId,
): HarnessSyncResult => {
  const projectSkillsPath = getLockSkillsPath(getProjectLockRoot(projectPath))
  const skillIds = listProjectSkills(projectSkillsPath)

  if (skillIds.length === 0) return { total: 0, linked: 0, conflicts: 0 }

  let linked = 0
  let conflicts = 0

  for (const skillId of skillIds) {
    const targetPath = getHarnessTargetPath(projectSkillsPath, harnessId, skillId)
    const symlinkPath = getHarnessSymlinkPath(projectPath, harnessId, skillId)

    if (!existsSync(targetPath)) continue

    const result = ensureSymlink(symlinkPath, targetPath)
    if (result.linked) linked += 1
    if (result.conflict) conflicts += 1
  }

  return { total: skillIds.length, linked, conflicts }
}

export type HarnessImportResult = {
  total: number
  imported: number
  linked: number
}

export const importHarnessSkills = (
  projectPath: string,
  harnessId: ToolId,
): HarnessImportResult => {
  const tool = TOOLS[harnessId]
  const baseDir = getHarnessBaseDir(projectPath, harnessId)
  if (!existsSync(baseDir)) return { total: 0, imported: 0, linked: 0 }

  const projectSkillsPath = getLockSkillsPath(getProjectLockRoot(projectPath))
  ensureDir(projectSkillsPath)

  const skillIds = listHarnessSkills(projectPath, harnessId)
  if (skillIds.length === 0) return { total: 0, imported: 0, linked: 0 }

  let imported = 0
  let linked = 0

  for (const skillId of skillIds) {
    const symlinkPath = getHarnessSymlinkPath(projectPath, harnessId, skillId)
    if (isSymlink(symlinkPath)) {
      linked += 1
      continue
    }

    if (tool.needsDirectory) {
      const sourceDir = join(baseDir, skillId)
      const targetDir = join(projectSkillsPath, skillId)
      copySkillDir(sourceDir, targetDir)
      imported += 1
      removePath(sourceDir)
      const targetPath = getHarnessTargetPath(projectSkillsPath, harnessId, skillId)
      const linkResult = ensureSymlink(symlinkPath, targetPath)
      if (linkResult.linked) linked += 1
      continue
    }

    const sourceFile = join(baseDir, `${skillId}.md`)
    if (!existsSync(sourceFile)) continue

    const content = readFileSync(sourceFile, 'utf-8')
    const targetDir = join(projectSkillsPath, skillId)
    ensureDir(targetDir)
    writeFileSync(join(targetDir, SKILL_FILE), content, 'utf-8')
    imported += 1
    removePath(sourceFile)
    const targetPath = getHarnessTargetPath(projectSkillsPath, harnessId, skillId)
    const linkResult = ensureSymlink(symlinkPath, targetPath)
    if (linkResult.linked) linked += 1
  }

  return { total: skillIds.length, imported, linked }
}

export const removeHarnessSymlinks = (projectPath: string, harnessId: ToolId): number => {
  const projectSkillsPath = getLockSkillsPath(getProjectLockRoot(projectPath))
  const skillIds = listProjectSkills(projectSkillsPath)
  if (skillIds.length === 0) return 0

  let removed = 0
  for (const skillId of skillIds) {
    const symlinkPath = getHarnessSymlinkPath(projectPath, harnessId, skillId)
    if (isSymlink(symlinkPath)) {
      unlinkSync(symlinkPath)
      removed += 1
    }
  }
  return removed
}
