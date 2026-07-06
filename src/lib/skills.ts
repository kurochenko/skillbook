import { basename, dirname } from 'path'
import { SKILL_FILE, TOOLS } from '@/constants'

const SKILL_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const LEGACY_SKILL_NAME_PATTERN = /^[a-z0-9_][a-z0-9_-]*$/

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const HARNESS_PATTERNS = Object.values(TOOLS).map((tool) => {
  const baseDirPattern = escapeRegExp(tool.baseDir.join('/'))
  if (tool.needsDirectory) {
    return new RegExp(`${baseDirPattern}/([^/]+)/${escapeRegExp(SKILL_FILE)}$`, 'i')
  }

  return new RegExp(`${baseDirPattern}/([^/]+)${escapeRegExp(tool.fileSuffix ?? '')}$`, 'i')
})

// Legacy Cursor rule files remain importable/scannable for older projects.
const LEGACY_HARNESS_PATTERNS = [
  new RegExp(`${escapeRegExp('.cursor/rules')}/([^/]+)\\.md$`, 'i'),
]

export type SkillNameValidation =
  | { valid: true; name: string }
  | { valid: false; error: string }

export const validateSkillName = (name: string): SkillNameValidation => {
  if (!name) {
    return { valid: false, error: 'Skill name cannot be empty' }
  }

  if (name.length > 64) {
    return { valid: false, error: 'Skill name must be at most 64 characters' }
  }

  if (/\s/.test(name)) {
    return { valid: false, error: 'Skill name cannot contain spaces' }
  }

  if (/[A-Z]/.test(name)) {
    return { valid: false, error: 'Skill name cannot contain uppercase letters' }
  }

  if (name.includes('_')) {
    return { valid: false, error: 'Skill name underscores are not allowed (Agent Skills spec)' }
  }

  if (name.startsWith('-')) {
    return { valid: false, error: 'Skill name cannot start with a hyphen' }
  }

  if (name.endsWith('-')) {
    return { valid: false, error: 'Skill name cannot end with a hyphen' }
  }

  if (name.includes('--')) {
    return { valid: false, error: 'Skill name cannot contain consecutive hyphens' }
  }

  if (!SKILL_NAME_PATTERN.test(name)) {
    return {
      valid: false,
      error: 'Skill name can only contain lowercase letters, numbers, and hyphens',
    }
  }

  return { valid: true, name }
}

export const validateExistingSkillName = (name: string): SkillNameValidation => {
  if (!name) {
    return { valid: false, error: 'Skill name cannot be empty' }
  }

  if (name.length > 64) {
    return { valid: false, error: 'Skill name must be at most 64 characters' }
  }

  if (/\s/.test(name)) {
    return { valid: false, error: 'Skill name cannot contain spaces' }
  }

  if (/[A-Z]/.test(name)) {
    return { valid: false, error: 'Skill name cannot contain uppercase letters' }
  }

  if (!LEGACY_SKILL_NAME_PATTERN.test(name)) {
    return {
      valid: false,
      error: 'Skill name can only contain lowercase letters, numbers, hyphens, and underscores',
    }
  }

  return { valid: true, name }
}

export const isLegacySkillName = (name: string): boolean =>
  validateExistingSkillName(name).valid && !validateSkillName(name).valid

export const extractSkillName = (filePath: string): string | null => {
  const normalizedPath = filePath.replace(/\\/g, '/')

  for (const pattern of [...HARNESS_PATTERNS, ...LEGACY_HARNESS_PATTERNS]) {
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
