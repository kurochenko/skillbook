import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { runCli } from '@/test-utils/cli'
import { SKILL_FILE } from '@/constants'
import { getLockSkillsPath, getProjectLockRoot } from '@/lib/lock-paths'

type DiffOutput = {
  id: string
  from: 'library' | 'project'
  to: 'library' | 'project'
  additions: number
  deletions: number
}

describe('diff command (CLI)', () => {
  let tempDir: string
  let libraryDir: string
  let projectDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'skillbook-diff-'))
    libraryDir = join(tempDir, '.SB')
    projectDir = join(tempDir, 'project')
    mkdirSync(projectDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  const env = () => ({ SKILLBOOK_LOCK_LIBRARY: libraryDir })

  const writeSkill = (root: string, skillId: string, content: string) => {
    const skillDir = join(getLockSkillsPath(root), skillId)
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(join(skillDir, SKILL_FILE), content, 'utf-8')
  }

  const parseJson = (output: string) => JSON.parse(output) as DiffOutput

  test('diff reports additions and deletions between library and project', () => {
    const libraryContent = 'Line 1\nLine 2\n'
    const projectContent = 'Line 1\nLine 3\n'

    writeSkill(libraryDir, 'alpha', libraryContent)
    writeSkill(getProjectLockRoot(projectDir), 'alpha', projectContent)

    const result = runCli(
      ['diff', 'alpha', '--project', projectDir, '--from', 'library', '--to', 'project', '--json'],
      env(),
    )

    expect(result.exitCode).toBe(0)
    const data = parseJson(result.stdout)
    expect(data.id).toBe('alpha')
    expect(data.from).toBe('library')
    expect(data.to).toBe('project')
    expect(data.additions).toBe(1)
    expect(data.deletions).toBe(1)
  })
})
