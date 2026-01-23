import { basename, dirname } from 'path'

const SKILL_NAME_PATTERN = /^[a-z0-9_][a-z0-9_-]{0,49}$/

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

  const claudeMatch = normalizedPath.match(/\.claude\/skills\/([^/]+)\/SKILL\.md$/i)
  if (claudeMatch) return claudeMatch[1]?.toLowerCase() ?? null

  const cursorMatch = normalizedPath.match(/\.cursor\/rules\/([^/]+)\.md$/i)
  if (cursorMatch) return cursorMatch[1]?.toLowerCase() ?? null

  const opencodeFlat = normalizedPath.match(/\.opencode\/skills?\/([^/]+)\.md$/i)
  if (opencodeFlat) return opencodeFlat[1]?.toLowerCase() ?? null

  const opencodeDir = normalizedPath.match(/\.opencode\/skills?\/([^/]+)\/SKILL\.md$/i)
  if (opencodeDir) return opencodeDir[1]?.toLowerCase() ?? null

  const fileName = basename(normalizedPath)
  if (fileName.toLowerCase() === 'skill.md') {
    const parentDir = basename(dirname(normalizedPath))
    if (parentDir && parentDir !== '.' && parentDir !== '..') {
      return parentDir.toLowerCase()
    }
  }

  return null
}
