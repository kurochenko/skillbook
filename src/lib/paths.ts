import { homedir } from 'os'
import { join } from 'path'
import {
  DEFAULT_LIBRARY_PATH,
  LOCK_BASE_DIR,
  LOCK_FILE,
  LOCK_LIBRARY_ENV,
  LOCK_SKILLS_DIR,
  SKILLS_DIR,
} from '@/constants'

const expandPath = (path: string): string =>
  path.startsWith('~') ? path.replace('~', homedir()) : path

export const getLibraryPath = (): string =>
  process.env.SKILLBOOK_LIBRARY ?? process.env[LOCK_LIBRARY_ENV] ?? expandPath(DEFAULT_LIBRARY_PATH)

export const getSkillsPath = (): string => join(getLibraryPath(), SKILLS_DIR)

export const getSkillPath = (skillName: string): string =>
  join(getSkillsPath(), skillName)

export const getProjectLockRoot = (projectPath: string): string =>
  join(projectPath, LOCK_BASE_DIR)

export const getLockSkillsPath = (basePath: string): string =>
  join(basePath, LOCK_SKILLS_DIR)

export const getLockFilePath = (basePath: string): string =>
  join(basePath, LOCK_FILE)
