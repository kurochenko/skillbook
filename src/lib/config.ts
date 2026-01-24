import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { parse, stringify } from 'yaml'

export const SKILLBOOK_DIR = '.skillbook'
export const CONFIG_FILE = 'config.yaml'
export const PROJECT_SKILLS_DIR = 'skills'

export type ProjectConfig = {
  harnesses: string[]
  skills: string[]
}

const DEFAULT_CONFIG: ProjectConfig = {
  harnesses: [],
  skills: [],
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
    const parsed = parse(content) as Partial<ProjectConfig>

    return {
      harnesses: parsed.harnesses ?? DEFAULT_CONFIG.harnesses,
      skills: parsed.skills ?? DEFAULT_CONFIG.skills,
    }
  } catch {
    return null
  }
}

export const writeConfig = (projectPath: string, config: ProjectConfig): void => {
  ensureSkillbookDir(projectPath)

  const configPath = getConfigPath(projectPath)
  const content = stringify(config)

  writeFileSync(configPath, content, 'utf-8')
}

export const updateConfig = (
  projectPath: string,
  updates: Partial<ProjectConfig>,
): ProjectConfig => {
  const current = readConfig(projectPath) ?? DEFAULT_CONFIG
  const updated = { ...current, ...updates }
  writeConfig(projectPath, updated)
  return updated
}

export const addSkillToConfig = (projectPath: string, skillName: string): void => {
  const config = readConfig(projectPath) ?? DEFAULT_CONFIG
  if (!config.skills.includes(skillName)) {
    config.skills = [...config.skills, skillName].sort()
    writeConfig(projectPath, config)
  }
}

export const removeSkillFromConfig = (projectPath: string, skillName: string): void => {
  const config = readConfig(projectPath) ?? DEFAULT_CONFIG
  config.skills = config.skills.filter((s) => s !== skillName)
  writeConfig(projectPath, config)
}

export const setHarnessEnabled = (
  projectPath: string,
  harness: string,
  enabled: boolean,
): void => {
  const config = readConfig(projectPath) ?? DEFAULT_CONFIG

  if (enabled && !config.harnesses.includes(harness)) {
    config.harnesses = [...config.harnesses, harness].sort()
  } else if (!enabled) {
    config.harnesses = config.harnesses.filter((h) => h !== harness)
  }

  writeConfig(projectPath, config)
}
