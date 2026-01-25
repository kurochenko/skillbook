import { existsSync, lstatSync, symlinkSync, unlinkSync, readlinkSync, mkdirSync, rmSync } from 'fs'
import { join, dirname, relative } from 'path'
import { TOOLS, type ToolId, SKILL_FILE } from '@/constants'
import { getSkillbookSkillsPath } from '@/lib/sparse-checkout'

export type SymlinkResult =
  | { success: true }
  | { success: false; error: string }

/**
 * Check if a path is a symbolic link
 */
export const isSymlink = (path: string): boolean => {
  try {
    return lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}

/**
 * Check if a path is a regular file (not a symlink)
 */
export const isRealFile = (path: string): boolean => {
  try {
    const stat = lstatSync(path)
    return stat.isFile() && !stat.isSymbolicLink()
  } catch {
    return false
  }
}

/**
 * Check if a path is a real directory (not a symlink)
 */
export const isRealDirectory = (path: string): boolean => {
  try {
    const stat = lstatSync(path)
    return stat.isDirectory() && !stat.isSymbolicLink()
  } catch {
    return false
  }
}

/**
 * Get the target of a symlink
 */
export const getSymlinkTarget = (path: string): string | null => {
  try {
    return readlinkSync(path)
  } catch {
    return null
  }
}

/**
 * Get the harness skill path for a given harness and skill name.
 * 
 * For directory-based harnesses: returns the SKILL.md file path (for content reading)
 * Use getHarnessSymlinkPath() for the actual symlink location.
 */
export const getHarnessSkillPath = (
  projectPath: string,
  harnessId: ToolId,
  skillName: string,
): string => {
  const tool = TOOLS[harnessId]
  return join(projectPath, tool.skillPath(skillName))
}

/**
 * Get the path where the symlink should be created.
 * 
 * For directory-based harnesses (claude-code, opencode): the skill folder
 *   e.g., .claude/skills/beads/
 * 
 * For flat-file harnesses (cursor): the skill file
 *   e.g., .cursor/rules/beads.md
 */
const getHarnessSymlinkPath = (
  projectPath: string,
  harnessId: ToolId,
  skillName: string,
): string => {
  const tool = TOOLS[harnessId]
  const skillFilePath = join(projectPath, tool.skillPath(skillName))
  
  if (tool.needsDirectory) {
    // For directory-based, symlink is the folder (parent of SKILL.md)
    return dirname(skillFilePath)
  } else {
    // For flat-file, symlink is the file itself
    return skillFilePath
  }
}

/**
 * Get the path in .skillbook that the symlink should point to.
 * 
 * For directory-based harnesses: the skill folder in .skillbook
 *   e.g., .skillbook/skills/beads/
 * 
 * For flat-file harnesses: the SKILL.md file in .skillbook
 *   e.g., .skillbook/skills/beads/SKILL.md
 */
const getSkillbookSourcePath = (
  projectPath: string,
  harnessId: ToolId,
  skillName: string,
): string => {
  const tool = TOOLS[harnessId]
  const skillbookSkillDir = join(getSkillbookSkillsPath(projectPath), skillName)
  
  if (tool.needsDirectory) {
    // For directory-based, source is the folder
    return skillbookSkillDir
  } else {
    // For flat-file, source is the SKILL.md file
    return join(skillbookSkillDir, SKILL_FILE)
  }
}

/**
 * Calculate the relative path for the symlink target.
 */
const calculateSymlinkTarget = (
  projectPath: string,
  harnessId: ToolId,
  skillName: string,
): string => {
  const symlinkPath = getHarnessSymlinkPath(projectPath, harnessId, skillName)
  const sourcePath = getSkillbookSourcePath(projectPath, harnessId, skillName)
  
  // Calculate relative path from symlink location to source
  const symlinkDir = dirname(symlinkPath)
  return relative(symlinkDir, sourcePath)
}

/**
 * Create a symlink from harness location to .skillbook/skills/
 *
 * For directory-based harnesses (claude-code, opencode):
 *   .claude/skills/beads/ -> ../../.skillbook/skills/beads/
 *
 * For flat-file harnesses (cursor):
 *   .cursor/rules/beads.md -> ../.skillbook/skills/beads/SKILL.md
 */
export const createSkillSymlink = (
  projectPath: string,
  harnessId: ToolId,
  skillName: string,
): SymlinkResult => {
  const tool = TOOLS[harnessId]
  const symlinkPath = getHarnessSymlinkPath(projectPath, harnessId, skillName)
  const targetPath = calculateSymlinkTarget(projectPath, harnessId, skillName)
  
  // Ensure parent directory exists
  const parentDir = dirname(symlinkPath)
  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true })
  }

  // Check if something already exists at the symlink path
  if (existsSync(symlinkPath) || isSymlink(symlinkPath)) {
    if (isSymlink(symlinkPath)) {
      // Remove existing symlink
      unlinkSync(symlinkPath)
    } else if (tool.needsDirectory && isRealDirectory(symlinkPath)) {
      // Real directory exists - fail (use convertToSymlink instead)
      return { success: false, error: `Directory exists and is not a symlink: ${symlinkPath}` }
    } else if (!tool.needsDirectory && isRealFile(symlinkPath)) {
      // Real file exists - fail (use convertToSymlink instead)
      return { success: false, error: `File exists and is not a symlink: ${symlinkPath}` }
    }
  }

  // Create symlink
  try {
    symlinkSync(targetPath, symlinkPath)
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: `Failed to create symlink: ${message}` }
  }
}

/**
 * Remove a skill symlink from a harness.
 */
export const removeSkillSymlink = (
  projectPath: string,
  harnessId: ToolId,
  skillName: string,
): SymlinkResult => {
  const symlinkPath = getHarnessSymlinkPath(projectPath, harnessId, skillName)

  // If it doesn't exist, nothing to do
  if (!existsSync(symlinkPath) && !isSymlink(symlinkPath)) {
    return { success: true }
  }

  // Only remove if it's a symlink
  if (!isSymlink(symlinkPath)) {
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

/**
 * Convert a real file/directory to a symlink.
 * This removes the real file/directory and creates a symlink in its place.
 * The content should already be in .skillbook/skills/ before calling this.
 */
export const convertToSymlink = (
  projectPath: string,
  harnessId: ToolId,
  skillName: string,
): SymlinkResult => {
  const tool = TOOLS[harnessId]
  const symlinkPath = getHarnessSymlinkPath(projectPath, harnessId, skillName)
  
  // Verify the source exists in skillbook
  const sourcePath = getSkillbookSourcePath(projectPath, harnessId, skillName)
  if (!existsSync(sourcePath)) {
    return { success: false, error: `Skill not found in .skillbook: ${skillName}` }
  }

  // If already a symlink, nothing to do
  if (isSymlink(symlinkPath)) {
    return { success: true }
  }

  // Remove the real file/directory
  if (existsSync(symlinkPath)) {
    if (tool.needsDirectory) {
      // Remove the entire skill directory
      rmSync(symlinkPath, { recursive: true, force: true })
    } else {
      // Remove the file
      unlinkSync(symlinkPath)
    }
  }

  // Create symlink
  return createSkillSymlink(projectPath, harnessId, skillName)
}

/**
 * Check if a skill in a harness is a symlink pointing to .skillbook
 */
export const isSkillSymlinked = (
  projectPath: string,
  harnessId: ToolId,
  skillName: string,
): boolean => {
  const symlinkPath = getHarnessSymlinkPath(projectPath, harnessId, skillName)

  if (!isSymlink(symlinkPath)) {
    return false
  }

  // Verify it points to .skillbook
  const target = getSymlinkTarget(symlinkPath)
  if (!target) return false

  return target.includes('.skillbook')
}

/**
 * Create symlinks for a skill in all specified harnesses
 */
export const createSymlinksForSkill = (
  projectPath: string,
  harnessIds: ToolId[],
  skillName: string,
): SymlinkResult => {
  for (const harnessId of harnessIds) {
    const result = createSkillSymlink(projectPath, harnessId, skillName)
    if (!result.success) {
      return result
    }
  }
  return { success: true }
}

/**
 * Remove symlinks for a skill from all specified harnesses
 */
export const removeSymlinksForSkill = (
  projectPath: string,
  harnessIds: ToolId[],
  skillName: string,
): SymlinkResult => {
  for (const harnessId of harnessIds) {
    const result = removeSkillSymlink(projectPath, harnessId, skillName)
    if (!result.success) {
      return result
    }
  }
  return { success: true }
}
