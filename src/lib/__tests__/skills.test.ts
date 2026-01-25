import { describe, expect, test } from 'bun:test'
import { validateSkillName, extractSkillName } from '@/lib/skills'

describe('validateSkillName', () => {
  test('accepts valid names', () => {
    const cases = [
      'beads',
      'typescript',
      'review-gitlab',
      'my-skill-2',
      'my_skill',
      'snake_case_name',
      '_private',
      '_underscore_start',
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
      { name: 'a'.repeat(51), error: '50 characters' },
      { name: 'Beads', error: 'lowercase' },
      { name: 'my skill', error: 'spaces' },
      { name: 'skill@test', error: null },
      { name: 'skill.test', error: null },
      { name: 'skill/test', error: null },
      { name: '-skill', error: null },
    ]

    for (const { name, error } of cases) {
      const result = validateSkillName(name)
      expect(result.valid).toBe(false)
      if (error && !result.valid) expect(result.error).toContain(error)
    }
  })
})

describe('extractSkillName', () => {
  test('extracts names from supported paths', () => {
    const cases: Array<[string, string | null]> = [
      ['.claude/skills/beads/SKILL.md', 'beads'],
      ['/Users/foo/.claude/skills/typescript/SKILL.md', 'typescript'],
      ['./project/.claude/skills/review-gitlab/SKILL.md', 'review-gitlab'],
      ['.cursor/rules/typescript.md', 'typescript'],
      ['/Users/foo/.cursor/rules/beads.md', 'beads'],
      ['.opencode/skill/beads/SKILL.md', 'beads'],
      ['/Users/foo/.opencode/skill/typescript/SKILL.md', 'typescript'],
      ['my-skill/SKILL.md', 'my-skill'],
      ['/some/path/custom-skill/SKILL.md', 'custom-skill'],
      ['.claude/skills/MySkill/SKILL.md', 'myskill'],
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
