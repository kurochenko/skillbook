import { existsSync, readdirSync } from 'fs'
import { join, relative } from 'path'
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

export type CollectedFile = {
  fullPath: string
  relativePath: string
}

export const collectFiles = (dir: string, base: string = dir, acc: CollectedFile[] = []): CollectedFile[] => {
  if (!existsSync(dir)) return acc
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      collectFiles(fullPath, base, acc)
    } else if (entry.isFile()) {
      acc.push({
        fullPath,
        relativePath: relative(base, fullPath).replace(/\\/g, '/'),
      })
    }
  }
  return acc
}
