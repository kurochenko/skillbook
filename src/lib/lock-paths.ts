import { homedir } from 'os'
import { join } from 'path'
import {
  DEFAULT_LOCK_LIBRARY_PATH,
  LOCK_BASE_DIR,
  LOCK_FILE,
  LOCK_LIBRARY_ENV,
  LOCK_SKILLS_DIR,
} from '@/lib/lock-constants'

const expandPath = (path: string): string =>
  path.startsWith('~') ? path.replace('~', homedir()) : path

export const getLockLibraryPath = (): string =>
  process.env[LOCK_LIBRARY_ENV] ?? expandPath(DEFAULT_LOCK_LIBRARY_PATH)

export const getProjectLockRoot = (projectPath: string): string =>
  join(projectPath, LOCK_BASE_DIR)

export const getLockSkillsPath = (basePath: string): string =>
  join(basePath, LOCK_SKILLS_DIR)

export const getLockFilePath = (basePath: string): string =>
  join(basePath, LOCK_FILE)
