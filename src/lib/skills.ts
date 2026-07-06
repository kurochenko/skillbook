import { basename, dirname } from 'path'
import { SKILL_FILE, TOOLS } from '@/constants'

const SKILL_NAME_PATTERN = /^[a-z0-9_][a-z0-9_-]{0,49}$/

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const HARNESS_PATTERNS = Object.values(TOOLS).map((tool) => {
  const baseDirPattern = escapeRegExp(tool.baseDir.join('/'))
  if (tool.needsDirectory) {
    return new RegExp(`${baseDirPattern}/([^/]+)/${escapeRegExp(SKILL_FILE)}$`, 'i')
  }

  return new RegExp(`${baseDirPattern}/([^/]+)${escapeRegExp(tool.fileSuffix ?? '')}$`, 'i')
})

export type SkillNameValidation =
  | { valid: true; name: string }
  | { valid: false; error: string }

export const validateSkillName = (name: string): SkillNameValidation => {
  if (!name) {
    return { valid: false, error: 'Skill name cannot be empty' }
  }

  if (name.length > 50) {
    return { valid: false, error: 'Skill name must be at most 50 characters' }
  }

  if (/\s/.test(name)) {
    return { valid: false, error: 'Skill name cannot contain spaces' }
  }

  if (!SKILL_NAME_PATTERN.test(name)) {
    return {
      valid: false,
      error: 'Skill name can only contain lowercase letters, numbers, hyphens, and underscores',
    }
  }

  return { valid: true, name }
}

export const extractSkillName = (filePath: string): string | null => {
  const normalizedPath = filePath.replace(/\\/g, '/')

  for (const pattern of HARNESS_PATTERNS) {
    const match = normalizedPath.match(pattern)
    if (match?.[1]) return match[1].toLowerCase()
  }

  const fileName = basename(normalizedPath)
  if (fileName.toLowerCase() === 'skill.md') {
    const parentDir = basename(dirname(normalizedPath))
    if (parentDir && parentDir !== '.' && parentDir !== '..') {
      return parentDir.toLowerCase()
    }
  }

  return null
}
