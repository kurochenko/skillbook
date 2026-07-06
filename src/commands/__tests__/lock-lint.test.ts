import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { SKILL_FILE } from '@/constants'
import { runCli } from '@/test-utils/cli'

describe('lint command', () => {
  let tempDir: string
  let projectDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'skillbook-lock-lint-'))
    projectDir = join(tempDir, 'project')
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  const writeProjectSkill = (name: string, content: string) => {
    const dir = join(projectDir, '.skillbook', 'skills', name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, SKILL_FILE), content, 'utf-8')
  }

  test('clean skill passes', () => {
    writeProjectSkill('clean-skill', [
      '---',
      'name: clean-skill',
      'description: Clean project skill.',
      '---',
      '# Clean Skill',
    ].join('\n'))

    const result = runCli(['lint', '--project', projectDir])

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('lint clean')
  })

  test('underscore name and missing description report errors', () => {
    writeProjectSkill('bad_skill', [
      '---',
      'name: bad_skill',
      '---',
      '# Bad Skill',
    ].join('\n'))

    const result = runCli(['lint', '--project', projectDir])

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('bad_skill')
    expect(result.output).toContain('name-spec')
    expect(result.output).toContain('frontmatter')
    expect(result.output).toContain('not Agent Skills spec-compliant')
    expect(result.output).toContain('non-empty name and description')
  })

  test('--json emits envelope and exits 1 for errors', () => {
    writeProjectSkill('bad_skill', [
      '---',
      'name: bad_skill',
      '---',
      '# Bad Skill',
    ].join('\n'))

    const result = runCli(['lint', '--project', projectDir, '--json'])
    const json = JSON.parse(result.stdout) as {
      ok: boolean
      skills: number
      findings: Array<{ skill: string; level: string; rule: string; detail: string }>
    }

    expect(result.exitCode).toBe(1)
    expect(json.ok).toBe(false)
    expect(json.skills).toBe(1)
    expect(json.findings.some((finding) =>
      finding.skill === 'bad_skill' &&
      finding.level === 'error' &&
      finding.rule === 'name-spec'
    )).toBe(true)
    expect(json.findings.some((finding) =>
      finding.skill === 'bad_skill' &&
      finding.level === 'error' &&
      finding.rule === 'frontmatter'
    )).toBe(true)
  })

  test('positional ids restrict lint scope', () => {
    writeProjectSkill('clean-skill', [
      '---',
      'name: clean-skill',
      'description: Clean project skill.',
      '---',
      '# Clean Skill',
    ].join('\n'))
    writeProjectSkill('bad_skill', [
      '---',
      'name: bad_skill',
      '---',
      '# Bad Skill',
    ].join('\n'))

    const result = runCli(['lint', 'clean-skill', '--project', projectDir, '--json'])
    const json = JSON.parse(result.stdout) as { ok: boolean; skills: number; findings: unknown[] }

    expect(result.exitCode).toBe(0)
    expect(json).toEqual({ ok: true, skills: 1, findings: [] })
  })

  test('unknown requested skill id reports an error and exits 1', () => {
    writeProjectSkill('clean-skill', [
      '---',
      'name: clean-skill',
      'description: Clean project skill.',
      '---',
      '# Clean Skill',
    ].join('\n'))

    const result = runCli(['lint', 'does-not-exist', '--project', projectDir, '--json'])
    const json = JSON.parse(result.stdout) as {
      ok: boolean
      skills: number
      findings: Array<{ skill: string; level: string; rule: string }>
    }

    expect(result.exitCode).toBe(1)
    expect(json.ok).toBe(false)
    expect(json.findings).toHaveLength(1)
    expect(json.findings[0]).toMatchObject({
      skill: 'does-not-exist',
      level: 'error',
      rule: 'unknown-skill',
    })
  })
})
