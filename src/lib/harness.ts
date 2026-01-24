import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { readConfig } from './config.js'
import { TOOLS, type ToolId, SUPPORTED_TOOLS } from '../constants.js'

export type HarnessInfo = {
  id: ToolId
  name: string
  exists: boolean
  enabled: boolean
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
 * Get full harness info for all supported harnesses
 */
export const getHarnessesInfo = (projectPath: string): HarnessInfo[] => {
  const enabled = new Set(getEnabledHarnesses(projectPath))

  return SUPPORTED_TOOLS.map((id) => ({
    id,
    name: TOOLS[id].name,
    exists: harnessExists(projectPath, id),
    enabled: enabled.has(id),
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
