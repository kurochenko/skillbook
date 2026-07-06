import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { SKILL_FILE } from '@/constants'
import { lintSkills, parseSkillFrontmatter } from '@/lib/lint'

describe('skill lint', () => {
  let tempDir: string
  let skillsPath: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'skillbook-lint-'))
    skillsPath = join(tempDir, 'skills')
    mkdirSync(skillsPath, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  const writeSkill = (name: string, content: string) => {
    const dir = join(skillsPath, name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, SKILL_FILE), content, 'utf-8')
  }

  test('clean skill passes', () => {
    writeSkill('clean-skill', [
      '---',
      'name: clean-skill',
      'description: A useful skill.',
      '---',
      '',
      '# Clean Skill',
    ].join('\n'))

    const result = lintSkills(skillsPath)

    expect(result).toEqual({ ok: true, findings: [], skills: 1 })
  })

  test('missing frontmatter reports an error', () => {
    writeSkill('no-frontmatter', '# No Frontmatter\n')

    const result = lintSkills(skillsPath)

    expect(result.ok).toBe(false)
    expect(result.findings).toContainEqual({
      skill: 'no-frontmatter',
      level: 'error',
      rule: 'frontmatter',
      detail: `${SKILL_FILE} must start with YAML frontmatter containing non-empty name and description fields`,
    })
  })

  test('empty description reports an error', () => {
    writeSkill('empty-description', [
      '---',
      'name: empty-description',
      'description:',
      '---',
      '# Empty',
    ].join('\n'))

    const result = lintSkills(skillsPath)

    expect(result.ok).toBe(false)
    expect(result.findings.some((finding) =>
      finding.skill === 'empty-description' &&
      finding.level === 'error' &&
      finding.rule === 'frontmatter' &&
      finding.detail.includes('non-empty name and description')
    )).toBe(true)
  })

  test('oversize body reports a warning only', () => {
    writeSkill('large-skill', [
      '---',
      'name: large-skill',
      'description: Large but valid.',
      '---',
      ...Array.from({ length: 501 }, (_, index) => `Line ${index + 1}`),
    ].join('\n'))

    const result = lintSkills(skillsPath)

    expect(result.ok).toBe(true)
    expect(result.findings).toContainEqual({
      skill: 'large-skill',
      level: 'warning',
      rule: 'body-length',
      detail: `${SKILL_FILE} is 505 lines; Agent Skills recommends staying under 500 lines with progressive disclosure`,
    })
  })

  test('reports name, description, and unknown frontmatter issues', () => {
    writeSkill('legacy_name', [
      '---',
      'name: other-name',
      `description: ${'x'.repeat(1025)}`,
      'owner: someone',
      '---',
      '# Legacy',
    ].join('\n'))

    const result = lintSkills(skillsPath)
    const rules = result.findings.map((finding) => finding.rule)

    expect(result.ok).toBe(false)
    expect(rules).toContain('name-spec')
    expect(rules).toContain('name-mismatch')
    expect(rules).toContain('description-length')
    expect(rules).toContain('unknown-frontmatter')
  })
})

describe('parseSkillFrontmatter', () => {
  test('parses quoted values leniently', () => {
    const parsed = parseSkillFrontmatter([
      '---',
      'name: "quoted-skill"',
      "description: 'Quoted description'",
      '---',
      '# Body',
    ].join('\n'))

    expect(parsed.fields).toEqual({
      name: 'quoted-skill',
      description: 'Quoted description',
    })
    expect(parsed.body).toBe('# Body')
  })
})
