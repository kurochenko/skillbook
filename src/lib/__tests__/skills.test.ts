import { describe, expect, test } from 'bun:test'
import { validateSkillName, extractSkillName } from '../skills.ts'

describe('validateSkillName', () => {
  test('accepts valid names', () => {
    expect(validateSkillName('beads')).toEqual({ valid: true, name: 'beads' })
    expect(validateSkillName('typescript')).toEqual({ valid: true, name: 'typescript' })
    expect(validateSkillName('review-gitlab')).toEqual({ valid: true, name: 'review-gitlab' })
    expect(validateSkillName('my-skill-2')).toEqual({ valid: true, name: 'my-skill-2' })
    expect(validateSkillName('my_skill')).toEqual({ valid: true, name: 'my_skill' })
    expect(validateSkillName('snake_case_name')).toEqual({ valid: true, name: 'snake_case_name' })
    expect(validateSkillName('_private')).toEqual({ valid: true, name: '_private' })
    expect(validateSkillName('_underscore_start')).toEqual({ valid: true, name: '_underscore_start' })
    expect(validateSkillName('a')).toEqual({ valid: true, name: 'a' })
    expect(validateSkillName('1')).toEqual({ valid: true, name: '1' })
    expect(validateSkillName('123skill')).toEqual({ valid: true, name: '123skill' })
    expect(validateSkillName('2fa')).toEqual({ valid: true, name: '2fa' })
  })

  test('rejects empty name', () => {
    const result = validateSkillName('')
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toContain('empty')
  })

  test('rejects name too long', () => {
    const result = validateSkillName('a'.repeat(51))
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toContain('50 characters')
  })

  test('rejects uppercase letters', () => {
    const result = validateSkillName('Beads')
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toContain('lowercase')
  })

  test('rejects spaces', () => {
    const result = validateSkillName('my skill')
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toContain('spaces')
  })

  test('rejects special characters', () => {
    expect(validateSkillName('skill@test').valid).toBe(false)
    expect(validateSkillName('skill.test').valid).toBe(false)
    expect(validateSkillName('skill/test').valid).toBe(false)
  })

  test('rejects name starting with hyphen', () => {
    const result = validateSkillName('-skill')
    expect(result.valid).toBe(false)
  })
})

describe('extractSkillName', () => {
  test('extracts from .claude/skills/<name>/SKILL.md', () => {
    expect(extractSkillName('.claude/skills/beads/SKILL.md')).toBe('beads')
    expect(extractSkillName('/Users/foo/.claude/skills/typescript/SKILL.md')).toBe('typescript')
    expect(extractSkillName('./project/.claude/skills/review-gitlab/SKILL.md')).toBe('review-gitlab')
  })

  test('extracts from .cursor/rules/<name>.md', () => {
    expect(extractSkillName('.cursor/rules/typescript.md')).toBe('typescript')
    expect(extractSkillName('/Users/foo/.cursor/rules/beads.md')).toBe('beads')
  })

  test('extracts from .opencode/skill/<name>/SKILL.md', () => {
    expect(extractSkillName('.opencode/skill/beads/SKILL.md')).toBe('beads')
    expect(extractSkillName('/Users/foo/.opencode/skill/typescript/SKILL.md')).toBe('typescript')
  })

  test('extracts from generic <folder>/SKILL.md', () => {
    expect(extractSkillName('my-skill/SKILL.md')).toBe('my-skill')
    expect(extractSkillName('/some/path/custom-skill/SKILL.md')).toBe('custom-skill')
  })

  test('handles case insensitively and returns lowercase', () => {
    expect(extractSkillName('.claude/skills/MySkill/SKILL.md')).toBe('myskill')
    expect(extractSkillName('.cursor/rules/TypeScript.md')).toBe('typescript')
  })

  test('returns null for unrecognized patterns', () => {
    expect(extractSkillName('./random/file.md')).toBe(null)
    expect(extractSkillName('./skill.md')).toBe(null)
    expect(extractSkillName('SKILL.md')).toBe(null)
  })

  test('handles Windows-style paths', () => {
    expect(extractSkillName('.claude\\skills\\beads\\SKILL.md')).toBe('beads')
  })
})
