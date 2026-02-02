import { homedir } from 'os'
import { join } from 'path'
import { DEFAULT_LIBRARY_PATH, SKILLS_DIR } from '@/constants'

export const expandPath = (path: string): string =>
  path.startsWith('~') ? path.replace('~', homedir()) : path

export const getLibraryPath = (): string =>
  process.env.SKILLBOOK_LIBRARY ?? expandPath(DEFAULT_LIBRARY_PATH)

export const getSkillsPath = (): string => join(getLibraryPath(), SKILLS_DIR)

export const getSkillPath = (skillName: string): string =>
  join(getSkillsPath(), skillName)
