import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, lstatSync } from 'fs'
import { join, dirname } from 'path'
import { readConfig, setHarnessEnabled } from './config.js'
import { TOOLS, type ToolId, SUPPORTED_TOOLS } from '../constants.js'
import { isSkillSymlinked, createSkillSymlink } from './symlinks.js'

// Harness state:
// - 'enabled': Fully managed, all installed skills are symlinked
// - 'partial': Folder exists with content, but not fully managed (mixed state)
// - 'available': No folder exists
export type HarnessState = 'enabled' | 'partial' | 'available'

export type HarnessInfo = {
  id: ToolId
  name: string
  state: HarnessState
}

/**
 * Get the base directory for a harness (e.g., .claude/skills/, .opencode/skill/, .cursor/rules/)
 */
export const getHarnessBaseDir = (projectPath: string, harnessId: ToolId): string => {
  // Direct mapping to harness base directories
  switch (harnessId) {
    case 'claude-code':
      return join(projectPath, '.claude', 'skills')
    case 'opencode':
      return join(projectPath, '.opencode', 'skill')
    case 'cursor':
      return join(projectPath, '.cursor', 'rules')
  }
}

/**
 * Get the full path where a skill should be written for a harness
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
 * Check if a harness folder exists in the project
 */
export const harnessExists = (projectPath: string, harnessId: ToolId): boolean => {
  const baseDir = getHarnessBaseDir(projectPath, harnessId)
  return existsSync(baseDir)
}

/**
 * Detect which harnesses exist in the project (folders present)
 */
export const detectHarnesses = (projectPath: string): ToolId[] => {
  return SUPPORTED_TOOLS.filter((id) => harnessExists(projectPath, id))
}

/**
 * Get harnesses that are enabled in config, or auto-detect from existing folders
 */
export const getEnabledHarnesses = (projectPath: string): ToolId[] => {
  const config = readConfig(projectPath)

  if (config && config.harnesses.length > 0) {
    // Return configured harnesses that are valid tool IDs
    return config.harnesses.filter((h): h is ToolId =>
      SUPPORTED_TOOLS.includes(h as ToolId),
    )
  }

  // Auto-detect from existing folders
  return detectHarnesses(projectPath)
}

/**
 * Detect the state of a harness.
 * - 'enabled': In config AND all installed skills are symlinked
 * - 'partial': Folder exists but not fully managed
 * - 'available': No folder exists
 */
export const getHarnessState = (
  projectPath: string,
  harnessId: ToolId,
  installedSkillNames: string[],
): HarnessState => {
  const exists = harnessExists(projectPath, harnessId)

  if (!exists) {
    return 'available'
  }

  // Check if in config
  const config = readConfig(projectPath)
  const inConfig = config?.harnesses.includes(harnessId) ?? false

  if (!inConfig) {
    return 'partial'
  }

  // Check if all installed skills are symlinked
  const allSymlinked = installedSkillNames.every((skillName) =>
    isSkillSymlinked(projectPath, harnessId, skillName)
  )

  if (allSymlinked && installedSkillNames.length > 0) {
    return 'enabled'
  }

  // In config but not all symlinked, or no skills installed yet
  // If no skills, consider it enabled (nothing to sync)
  if (installedSkillNames.length === 0) {
    return 'enabled'
  }

  return 'partial'
}

/**
 * Get full harness info for all supported harnesses.
 * @param installedSkillNames - Names of installed skills (to check symlink status)
 */
export const getHarnessesInfo = (projectPath: string, installedSkillNames: string[] = []): HarnessInfo[] => {
  return SUPPORTED_TOOLS.map((id) => ({
    id,
    name: TOOLS[id].name,
    state: getHarnessState(projectPath, id, installedSkillNames),
  }))
}

/**
 * Write a skill to a specific harness location
 */
export const writeSkillToHarness = (
  projectPath: string,
  harnessId: ToolId,
  skillName: string,
  content: string,
): void => {
  const skillPath = getHarnessSkillPath(projectPath, harnessId, skillName)
  const dir = dirname(skillPath)

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  writeFileSync(skillPath, content, 'utf-8')
}

/**
 * Remove a skill from a specific harness location
 */
export const removeSkillFromHarness = (
  projectPath: string,
  harnessId: ToolId,
  skillName: string,
): void => {
  const skillPath = getHarnessSkillPath(projectPath, harnessId, skillName)

  if (!existsSync(skillPath)) {
    return
  }

  // For harnesses that use directories (claude-code, opencode), remove the whole dir
  const tool = TOOLS[harnessId]
  if (tool.needsDirectory) {
    const skillDir = dirname(skillPath)
    if (existsSync(skillDir)) {
      rmSync(skillDir, { recursive: true, force: true })
    }
  } else {
    // For flat file harnesses (cursor), just remove the file
    rmSync(skillPath, { force: true })
  }
}

/**
 * Read skill content from a harness location
 */
export const readSkillFromHarness = (
  projectPath: string,
  harnessId: ToolId,
  skillName: string,
): string | null => {
  const skillPath = getHarnessSkillPath(projectPath, harnessId, skillName)

  if (!existsSync(skillPath)) {
    return null
  }

  try {
    return readFileSync(skillPath, 'utf-8')
  } catch {
    return null
  }
}

/**
 * Sync a skill to all enabled harnesses
 */
export const syncSkillToHarnesses = (
  projectPath: string,
  skillName: string,
  content: string,
): void => {
  const enabledHarnesses = getEnabledHarnesses(projectPath)

  for (const harnessId of enabledHarnesses) {
    writeSkillToHarness(projectPath, harnessId, skillName, content)
  }
}

/**
 * Remove a skill from all harnesses
 */
export const removeSkillFromAllHarnesses = (
  projectPath: string,
  skillName: string,
): void => {
  for (const harnessId of SUPPORTED_TOOLS) {
    removeSkillFromHarness(projectPath, harnessId, skillName)
  }
}

/**
 * Sync all installed skills to a specific harness
 * Used when enabling a harness
 */
export const syncAllSkillsToHarness = (
  projectPath: string,
  harnessId: ToolId,
  skills: { name: string; content: string }[],
): void => {
  for (const skill of skills) {
    writeSkillToHarness(projectPath, harnessId, skill.name, skill.content)
  }
}

/**
 * Remove all skills from a specific harness
 * Used when disabling a harness
 */
export const removeAllSkillsFromHarness = (
  projectPath: string,
  harnessId: ToolId,
  skillNames: string[],
): void => {
  for (const skillName of skillNames) {
    removeSkillFromHarness(projectPath, harnessId, skillName)
  }
}

/**
 * Enable a harness: add to config, create symlinks for all installed skills.
 * @param installedSkillNames - Names of installed skills to sync
 * @param currentlyEnabled - Currently enabled harness IDs (to preserve in config)
 */
export const enableHarness = (
  projectPath: string,
  harnessId: ToolId,
  installedSkillNames: string[],
  currentlyEnabled: string[],
): void => {
  // Add to config
  setHarnessEnabled(projectPath, harnessId, true, currentlyEnabled)

  // Create symlinks for all installed skills
  for (const skillName of installedSkillNames) {
    createSkillSymlink(projectPath, harnessId, skillName)
  }
}

/**
 * Remove a harness: delete the harness folder entirely.
 * This is destructive - the folder and all its contents are deleted.
 */
export const removeHarness = (
  projectPath: string,
  harnessId: ToolId,
  currentlyEnabled: string[],
): void => {
  const baseDir = getHarnessBaseDir(projectPath, harnessId)

  // Remove from config
  setHarnessEnabled(projectPath, harnessId, false, currentlyEnabled)

  // Delete the folder
  if (existsSync(baseDir)) {
    rmSync(baseDir, { recursive: true, force: true })
  }
}

/**
 * Detach a harness: convert symlinks to real files, remove from config.
 * Files are preserved as standalone copies.
 * @param installedSkillNames - Names of installed skills to detach
 * @param currentlyEnabled - Currently enabled harness IDs (to preserve in config)
 */
export const detachHarness = (
  projectPath: string,
  harnessId: ToolId,
  installedSkillNames: string[],
  currentlyEnabled: string[],
): void => {
  // Convert symlinks to real files
  for (const skillName of installedSkillNames) {
    convertSymlinkToRealFile(projectPath, harnessId, skillName)
  }

  // Remove from config
  setHarnessEnabled(projectPath, harnessId, false, currentlyEnabled)
}

/**
 * Convert a symlink to a real file (for detach operation).
 * Reads the content through the symlink and writes it as a real file.
 */
const convertSymlinkToRealFile = (
  projectPath: string,
  harnessId: ToolId,
  skillName: string,
): void => {
  const tool = TOOLS[harnessId]
  const skillPath = join(projectPath, tool.skillPath(skillName))

  // Check if it's a symlink
  if (!existsSync(skillPath)) {
    return
  }

  try {
    const stat = lstatSync(skillPath)
    if (!stat.isSymbolicLink()) {
      // Already a real file, nothing to do
      return
    }

    // Read content through symlink
    const content = readFileSync(skillPath, 'utf-8')

    // Check if this is a directory-based harness
    const isDirectorySymlink = tool.needsDirectory

    if (isDirectorySymlink) {
      // For directory harnesses (claude-code, opencode), the symlink is the skill folder
      const skillDir = dirname(skillPath)

      // Remove the symlink (it's pointing to the folder)
      rmSync(skillDir, { force: true })

      // Create the directory and write the file
      mkdirSync(skillDir, { recursive: true })
      writeFileSync(skillPath, content, 'utf-8')
    } else {
      // For flat file harnesses (cursor), the symlink is the file itself
      rmSync(skillPath, { force: true })
      writeFileSync(skillPath, content, 'utf-8')
    }
  } catch {
    // Ignore errors (broken symlinks, etc.)
  }
}
