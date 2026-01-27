import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { SKILLBOOK_DIR, SKILLS_DIR } from '@/constants'
import { logError } from '@/lib/logger'

export const CONFIG_FILE = 'config.json'

export type ProjectConfig = {
  harnesses: string[]
}

const DEFAULT_CONFIG: ProjectConfig = {
  harnesses: [],
}

const getSkillbookDir = (projectPath: string): string =>
  join(projectPath, SKILLBOOK_DIR)

const getConfigPath = (projectPath: string): string =>
  join(getSkillbookDir(projectPath), CONFIG_FILE)

const getProjectSkillsDir = (projectPath: string): string =>
  join(getSkillbookDir(projectPath), SKILLS_DIR)

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
  } catch (error) {
    logError('Failed to read config', error, { configPath })
    return null
  }
}

export const writeConfig = (projectPath: string, config: ProjectConfig): void => {
  ensureSkillbookDir(projectPath)

  const configPath = getConfigPath(projectPath)
  const content = JSON.stringify(config, null, 2)

  writeFileSync(configPath, content + '\n', 'utf-8')
}

export const setHarnessEnabled = (
  projectPath: string,
  harness: string,
  enabled: boolean,
  currentlyEnabled: string[],
): void => {
  const config = readConfig(projectPath) ?? { harnesses: [...currentlyEnabled] }
  const harnesses = new Set(config.harnesses)

  if (enabled) {
    harnesses.add(harness)
  } else {
    harnesses.delete(harness)
  }

  writeConfig(projectPath, { harnesses: [...harnesses].sort() })
}
