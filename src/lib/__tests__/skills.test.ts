import { describe, expect, test } from 'bun:test'
import { validateSkillName, validateExistingSkillName, isLegacySkillName, extractSkillName } from '@/lib/skills'

describe('validateSkillName', () => {
  test('accepts valid names', () => {
    const cases = [
      'beads',
      'typescript',
      'review-gitlab',
      'my-skill-2',
      'a',
      '1',
      '123skill',
      '2fa',
    ]

    for (const name of cases) {
      expect(validateSkillName(name)).toEqual({ valid: true, name })
    }
  })

  test('rejects invalid names', () => {
    const cases = [
      { name: '', error: 'empty' },
      { name: 'a'.repeat(65), error: '64 characters' },
      { name: 'Beads', error: 'uppercase' },
      { name: 'my skill', error: 'spaces' },
      { name: 'my_skill', error: 'underscores are not allowed (Agent Skills spec)' },
      { name: 'snake_case_name', error: 'underscores are not allowed (Agent Skills spec)' },
      { name: '_private', error: 'underscores are not allowed (Agent Skills spec)' },
      { name: 'skill@test', error: null },
      { name: 'skill.test', error: null },
      { name: 'skill/test', error: null },
      { name: '-skill', error: 'start with a hyphen' },
      { name: 'skill-', error: 'end with a hyphen' },
      { name: 'my--skill', error: 'consecutive hyphens' },
    ]

    for (const { name, error } of cases) {
      const result = validateSkillName(name)
      expect(result.valid).toBe(false)
      if (error && !result.valid) expect(result.error).toContain(error)
    }
  })
})

describe('validateExistingSkillName', () => {
  test('accepts legacy underscore names', () => {
    const cases = [
      'my_skill',
      'snake_case_name',
      '_private',
      '_underscore_start',
      'skill-v2',
    ]

    for (const name of cases) {
      expect(validateExistingSkillName(name)).toEqual({ valid: true, name })
    }
  })

  test('identifies legacy-only names', () => {
    expect(isLegacySkillName('my_skill')).toBe(true)
    expect(isLegacySkillName('my-skill')).toBe(false)
  })

  test('still rejects unsafe existing ids', () => {
    const result = validateExistingSkillName('../../x')
    expect(result.valid).toBe(false)
  })
})

describe('extractSkillName', () => {
  test('extracts names from supported paths', () => {
    const cases: Array<[string, string | null]> = [
      ['.claude/skills/beads/SKILL.md', 'beads'],
      ['/Users/foo/.claude/skills/typescript/SKILL.md', 'typescript'],
      ['./project/.claude/skills/review-gitlab/SKILL.md', 'review-gitlab'],
      ['.cursor/skills/typescript/SKILL.md', 'typescript'],
      ['/Users/foo/.cursor/skills/beads/SKILL.md', 'beads'],
      ['.cursor/rules/typescript.md', 'typescript'],
      ['/Users/foo/.cursor/rules/beads.md', 'beads'],
      ['.opencode/skill/beads/SKILL.md', 'beads'],
      ['/Users/foo/.opencode/skill/typescript/SKILL.md', 'typescript'],
      ['.agents/skills/beads/SKILL.md', 'beads'],
      ['/Users/foo/.agents/skills/typescript/SKILL.md', 'typescript'],
      ['.pi/skills/beads/SKILL.md', 'beads'],
      ['/Users/foo/.pi/skills/typescript/SKILL.md', 'typescript'],
      ['my-skill/SKILL.md', 'my-skill'],
      ['/some/path/custom-skill/SKILL.md', 'custom-skill'],
      ['.claude/skills/MySkill/SKILL.md', 'myskill'],
      ['.cursor/skills/TypeScript/SKILL.md', 'typescript'],
      ['.cursor/rules/TypeScript.md', 'typescript'],
      ['./random/file.md', null],
      ['./skill.md', null],
      ['SKILL.md', null],
      ['.claude\\skills\\beads\\SKILL.md', 'beads'],
    ]

    for (const [path, expected] of cases) {
      expect(extractSkillName(path)).toBe(expected)
    }
  })
})
