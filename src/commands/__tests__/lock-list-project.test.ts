import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { runCli } from '@/test-utils/cli'
import { SKILL_FILE } from '@/constants'
import { getLockSkillsPath, getProjectLockRoot } from '@/lib/lock-paths'

type ListOutput = {
  scope: 'project' | 'library'
  path: string
  skills: string[]
}

describe('list --project (CLI)', () => {
  let tempDir: string
  let projectDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'skillbook-list-project-'))
    projectDir = join(tempDir, 'project')
    mkdirSync(projectDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  const writeProjectSkill = (id: string, content: string) => {
    const skillDir = join(getLockSkillsPath(getProjectLockRoot(projectDir)), id)
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(join(skillDir, SKILL_FILE), content, 'utf-8')
  }

  const parseJson = (output: string) => JSON.parse(output) as ListOutput

  test('lists project skills as JSON', () => {
    writeProjectSkill('alpha', '# Alpha\n')
    writeProjectSkill('beta', '# Beta\n')

    const result = runCli(['list', '--project', projectDir, '--json'])

    expect(result.exitCode).toBe(0)
    const data = parseJson(result.stdout)
    expect(data.scope).toBe('project')
    expect(data.path).toBe(projectDir)
    expect(data.skills).toEqual(['alpha', 'beta'])
  })

  test('returns empty list when project has no skills', () => {
    const result = runCli(['list', '--project', projectDir, '--json'])

    expect(result.exitCode).toBe(0)
    const data = parseJson(result.stdout)
    expect(data.scope).toBe('project')
    expect(data.skills).toEqual([])
  })
})
