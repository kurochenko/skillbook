import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, lstatSync } from 'fs'
import { join, dirname } from 'path'
import { readConfig, setHarnessEnabled } from '@/lib/config'
import { TOOLS, type ToolId, SUPPORTED_TOOLS } from '@/constants'
import { isSkillSymlinked, convertToSymlink } from '@/lib/symlinks'

// Harness state:
// - 'enabled': Fully managed, all installed skills are symlinked
// - 'detached': Folder exists with real files only (no symlinks), consistent state
// - 'partial': Mixed state (some symlinks, some real files, or inconsistent)
// - 'available': No folder exists
export type HarnessState = 'enabled' | 'detached' | 'partial' | 'available'

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
 * - 'detached': Folder exists, not in config, all present skills are real files (no symlinks)
 * - 'partial': Mixed state (some symlinks, some real files, or inconsistent)
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

  // Count symlinked vs not symlinked skills in this harness
  const skillStatuses = installedSkillNames.map((skillName) => ({
    name: skillName,
    isSymlinked: isSkillSymlinked(projectPath, harnessId, skillName),
    exists: skillExistsInHarness(projectPath, harnessId, skillName),
  }))

  const presentSkills = skillStatuses.filter((s) => s.exists)
  const allSymlinked = presentSkills.length > 0 && presentSkills.every((s) => s.isSymlinked)
  const noneSymlinked = presentSkills.length > 0 && presentSkills.every((s) => !s.isSymlinked)

  if (inConfig) {
    // In config - check if fully managed
    if (allSymlinked || presentSkills.length === 0) {
      return 'enabled'
    }
    // In config but mixed or no symlinks
    return 'partial'
  } else {
    // Not in config
    if (noneSymlinked) {
      // All real files, no symlinks - this is a clean detached state
      return 'detached'
    }
    if (presentSkills.length === 0) {
      // Folder exists but no skills - could be empty or have other content
      return 'partial'
    }
    // Mixed state (some symlinks, some real) or only symlinks without config
    return 'partial'
  }
}

/**
 * Check if a skill exists in a harness (regardless of symlink status)
 */
const skillExistsInHarness = (
  projectPath: string,
  harnessId: ToolId,
  skillName: string,
): boolean => {
  const tool = TOOLS[harnessId]
  const skillPath = join(projectPath, tool.skillPath(skillName))
  return existsSync(skillPath)
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

  // Create symlinks for all installed skills (convertToSymlink handles real files)
  for (const skillName of installedSkillNames) {
    convertToSymlink(projectPath, harnessId, skillName)
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
  const isDirectoryBased = tool.needsDirectory

  // Check what we need to examine for symlink status
  // For directory-based harnesses, the symlink is at the directory level
  // For flat file harnesses, the symlink is the file itself
  const symlinkPath = isDirectoryBased ? dirname(skillPath) : skillPath

  // Check if the path exists
  if (!existsSync(symlinkPath)) {
    return
  }

  try {
    const stat = lstatSync(symlinkPath)
    if (!stat.isSymbolicLink()) {
      // Already a real file/directory, nothing to do
      return
    }

    // Read content through symlink
    const content = readFileSync(skillPath, 'utf-8')

    if (isDirectoryBased) {
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
