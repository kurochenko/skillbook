import { homedir } from 'os'
import { join } from 'path'
import {
  DEFAULT_LEGACY_LIBRARY_PATH,
  DEFAULT_LOCK_LIBRARY_PATH,
  LOCK_BASE_DIR,
  LOCK_FILE,
  LEGACY_LIBRARY_ENV,
  LOCK_LIBRARY_ENV,
  LOCK_SKILLS_DIR,
} from '@/lib/lock-constants'

const expandPath = (path: string) =>
  path.startsWith('~') ? path.replace('~', homedir()) : path

export const getLockLibraryPath = () =>
  process.env[LOCK_LIBRARY_ENV] ?? expandPath(DEFAULT_LOCK_LIBRARY_PATH)

export const getLegacyLibraryPath = () =>
  process.env[LEGACY_LIBRARY_ENV] ?? expandPath(DEFAULT_LEGACY_LIBRARY_PATH)

export const getProjectLockRoot = (projectPath: string) =>
  join(projectPath, LOCK_BASE_DIR)

export const getLockSkillsPath = (basePath: string) =>
  join(basePath, LOCK_SKILLS_DIR)

export const getLockFilePath = (basePath: string) =>
  join(basePath, LOCK_FILE)
