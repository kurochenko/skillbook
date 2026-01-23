import { homedir } from 'os'
import { join } from 'path'
import { DEFAULT_LIBRARY_PATH, SKILLS_DIR } from '../constants.ts'

export const expandPath = (path: string) =>
  path.startsWith('~') ? path.replace('~', homedir()) : path

export const getLibraryPath = () => expandPath(DEFAULT_LIBRARY_PATH)

export const getSkillsPath = () => join(getLibraryPath(), SKILLS_DIR)

export const getSkillPath = (skillName: string) =>
  join(getSkillsPath(), skillName)
