import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { SKILL_FILE } from '@/constants'

export const getSkillDir = (skillsPath: string, skillId: string): string =>
  join(skillsPath, skillId)

export const getSkillFilePath = (skillsPath: string, skillId: string): string =>
  join(getSkillDir(skillsPath, skillId), SKILL_FILE)

export const listSkillIds = (skillsPath: string): string[] => {
  if (!existsSync(skillsPath)) return []

  return readdirSync(skillsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => existsSync(getSkillFilePath(skillsPath, entry.name)))
    .map((entry) => entry.name)
    .sort()
}
