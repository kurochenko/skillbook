import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export const SKILLBOOK_DIR = '.skillbook'
export const CONFIG_FILE = 'config.json'
export const PROJECT_SKILLS_DIR = 'skills'

export type ProjectConfig = {
  harnesses: string[]
}

const DEFAULT_CONFIG: ProjectConfig = {
  harnesses: [],
}

export const getSkillbookDir = (projectPath: string): string => {
  return join(projectPath, SKILLBOOK_DIR)
}

export const getConfigPath = (projectPath: string): string => {
  return join(getSkillbookDir(projectPath), CONFIG_FILE)
}

export const getProjectSkillsDir = (projectPath: string): string => {
  return join(getSkillbookDir(projectPath), PROJECT_SKILLS_DIR)
}

export const getProjectSkillPath = (projectPath: string, skillName: string): string => {
  return join(getProjectSkillsDir(projectPath), skillName, 'SKILL.md')
}

export const skillbookDirExists = (projectPath: string): boolean => {
  return existsSync(getSkillbookDir(projectPath))
}

export const ensureSkillbookDir = (projectPath: string): void => {
  const dir = getSkillbookDir(projectPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const skillsDir = getProjectSkillsDir(projectPath)
  if (!existsSync(skillsDir)) {
    mkdirSync(skillsDir, { recursive: true })
  }
}

export const readConfig = (projectPath: string): ProjectConfig | null => {
  const configPath = getConfigPath(projectPath)

  if (!existsSync(configPath)) {
    return null
  }

  try {
    const content = readFileSync(configPath, 'utf-8')
    const parsed = JSON.parse(content) as Partial<ProjectConfig>

    return {
      harnesses: parsed.harnesses ?? DEFAULT_CONFIG.harnesses,
    }
  } catch {
    return null
  }
}

export const writeConfig = (projectPath: string, config: ProjectConfig): void => {
  ensureSkillbookDir(projectPath)

  const configPath = getConfigPath(projectPath)
  const content = JSON.stringify(config, null, 2)

  writeFileSync(configPath, content + '\n', 'utf-8')
}

/**
 * Enable or disable a harness in the config.
 * 
 * @param currentlyEnabled - The harnesses currently enabled (from auto-detection or config).
 *   Required to preserve auto-detected harnesses when config doesn't exist yet.
 */
export const setHarnessEnabled = (
  projectPath: string,
  harness: string,
  enabled: boolean,
  currentlyEnabled: string[],
): void => {
  let config = readConfig(projectPath)

  // If no config exists, initialize with currently enabled harnesses
  // This preserves auto-detected harnesses when first creating the config
  if (!config) {
    config = { harnesses: [...currentlyEnabled] }
  }

  if (enabled && !config.harnesses.includes(harness)) {
    config.harnesses = [...config.harnesses, harness].sort()
  } else if (!enabled) {
    config.harnesses = config.harnesses.filter((h) => h !== harness)
  }

  writeConfig(projectPath, config)
}
