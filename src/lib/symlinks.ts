import { existsSync, lstatSync, symlinkSync, unlinkSync, readlinkSync, mkdirSync, rmSync } from 'fs'
import { join, dirname, relative } from 'path'
import { TOOLS, type ToolId, SKILL_FILE } from '@/constants'
import { getSkillbookSkillsPath } from '@/lib/sparse-checkout'

export type SymlinkResult =
  | { success: true }
  | { success: false; error: string }

type PathInfo = {
  symlinkPath: string
  sourcePath: string
  targetPath: string
}

const safeLstat = (path: string) => {
  try {
    return lstatSync(path)
  } catch {
    return null
  }
}

const safeReadlink = (path: string): string | null => {
  try {
    return readlinkSync(path)
  } catch {
    return null
  }
}

const isSymlink = (path: string): boolean =>
  safeLstat(path)?.isSymbolicLink() ?? false

const getHarnessPaths = (
  projectPath: string,
  harnessId: ToolId,
  skillName: string,
): PathInfo => {
  const tool = TOOLS[harnessId]
  const skillFilePath = join(projectPath, tool.skillPath(skillName))
  const skillbookSkillDir = join(getSkillbookSkillsPath(projectPath), skillName)

  const symlinkPath = tool.needsDirectory
    ? dirname(skillFilePath)
    : skillFilePath

  const sourcePath = tool.needsDirectory
    ? skillbookSkillDir
    : join(skillbookSkillDir, SKILL_FILE)

  const targetPath = relative(dirname(symlinkPath), sourcePath)

  return { symlinkPath, sourcePath, targetPath }
}

const createSkillSymlink = (
  projectPath: string,
  harnessId: ToolId,
  skillName: string,
): SymlinkResult => {
  const tool = TOOLS[harnessId]
  const { symlinkPath, targetPath } = getHarnessPaths(projectPath, harnessId, skillName)

  const parentDir = dirname(symlinkPath)
  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true })
  }

  const stat = safeLstat(symlinkPath)
  if (stat) {
    if (stat.isSymbolicLink()) {
      unlinkSync(symlinkPath)
    } else if (tool.needsDirectory && stat.isDirectory()) {
      return { success: false, error: `Directory exists and is not a symlink: ${symlinkPath}` }
    } else if (!tool.needsDirectory && stat.isFile()) {
      return { success: false, error: `File exists and is not a symlink: ${symlinkPath}` }
    }
  }

  try {
    symlinkSync(targetPath, symlinkPath)
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: `Failed to create symlink: ${message}` }
  }
}

const removeSkillSymlink = (
  projectPath: string,
  harnessId: ToolId,
  skillName: string,
): SymlinkResult => {
  const { symlinkPath } = getHarnessPaths(projectPath, harnessId, skillName)

  const stat = safeLstat(symlinkPath)
  if (!stat) return { success: true }

  if (!stat.isSymbolicLink()) {
    return { success: false, error: `Path is not a symlink: ${symlinkPath}` }
  }

  try {
    unlinkSync(symlinkPath)
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: `Failed to remove symlink: ${message}` }
  }
}

export const convertToSymlink = (
  projectPath: string,
  harnessId: ToolId,
  skillName: string,
): SymlinkResult => {
  const tool = TOOLS[harnessId]
  const { symlinkPath, sourcePath } = getHarnessPaths(projectPath, harnessId, skillName)

  if (!existsSync(sourcePath)) {
    return { success: false, error: `Skill not found in .skillbook: ${skillName}` }
  }

  if (isSymlink(symlinkPath)) {
    return { success: true }
  }

  if (existsSync(symlinkPath)) {
    if (tool.needsDirectory) {
      rmSync(symlinkPath, { recursive: true, force: true })
    } else {
      unlinkSync(symlinkPath)
    }
  }

  return createSkillSymlink(projectPath, harnessId, skillName)
}

export const isSkillSymlinked = (
  projectPath: string,
  harnessId: ToolId,
  skillName: string,
): boolean => {
  const { symlinkPath } = getHarnessPaths(projectPath, harnessId, skillName)

  if (!isSymlink(symlinkPath)) return false

  const target = safeReadlink(symlinkPath)
  return target !== null && target.includes('.skillbook')
}

export const createSymlinksForSkill = (
  projectPath: string,
  harnessIds: ToolId[],
  skillName: string,
): SymlinkResult => {
  for (const harnessId of harnessIds) {
    const result = createSkillSymlink(projectPath, harnessId, skillName)
    if (!result.success) return result
  }
  return { success: true }
}

export const removeSymlinksForSkill = (
  projectPath: string,
  harnessIds: ToolId[],
  skillName: string,
): SymlinkResult => {
  for (const harnessId of harnessIds) {
    const result = removeSkillSymlink(projectPath, harnessId, skillName)
    if (!result.success) return result
  }
  return { success: true }
}
