import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { runCli } from '@/test-utils/cli'
import { SKILL_FILE } from '@/constants'
import { getLockFilePath, getLockSkillsPath, getProjectLockRoot } from '@/lib/lock-paths'

type LockFile = {
  schema: 1
  skills: Record<string, { version: number; hash: string; updatedAt?: string }>
}

describe('uninstall command (CLI)', () => {
  let tempDir: string
  let projectDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'skillbook-uninstall-'))
    projectDir = join(tempDir, 'project')
    mkdirSync(projectDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  const projectRoot = () => getProjectLockRoot(projectDir)

  const writeProjectSkill = (id: string, content: string) => {
    const skillDir = join(getLockSkillsPath(projectRoot()), id)
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(join(skillDir, SKILL_FILE), content, 'utf-8')
  }

  const writeLockFile = (skills: LockFile['skills']) => {
    const lockPath = getLockFilePath(projectRoot())
    mkdirSync(projectRoot(), { recursive: true })
    writeFileSync(lockPath, JSON.stringify({ schema: 1, skills }, null, 2) + '\n', 'utf-8')
  }

  test('uninstall removes project skill and lock entry', () => {
    writeProjectSkill('alpha', '# Alpha\n')
    writeLockFile({ alpha: { version: 1, hash: 'sha256:alpha' } })

    const result = runCli(['uninstall', 'alpha', '--project', projectDir])

    expect(result.exitCode).toBe(0)
    expect(existsSync(join(getLockSkillsPath(projectRoot()), 'alpha'))).toBe(false)
    const lock = JSON.parse(readFileSync(getLockFilePath(projectRoot()), 'utf-8')) as LockFile
    expect(lock.skills.alpha).toBeUndefined()
  })

  test('uninstall removes harness copies', () => {
    writeProjectSkill('alpha', '# Alpha\n')
    writeLockFile({ alpha: { version: 1, hash: 'sha256:alpha' } })

    const claudeDir = join(projectDir, '.claude', 'skills', 'alpha')
    const cursorDir = join(projectDir, '.cursor', 'rules')
    const opencodeDir = join(projectDir, '.opencode', 'skill', 'alpha')
    mkdirSync(claudeDir, { recursive: true })
    mkdirSync(cursorDir, { recursive: true })
    mkdirSync(opencodeDir, { recursive: true })
    writeFileSync(join(claudeDir, SKILL_FILE), '# Alpha\n', 'utf-8')
    writeFileSync(join(cursorDir, 'alpha.md'), '# Alpha\n', 'utf-8')
    writeFileSync(join(opencodeDir, SKILL_FILE), '# Alpha\n', 'utf-8')

    const result = runCli(['uninstall', 'alpha', '--project', projectDir])

    expect(result.exitCode).toBe(0)
    expect(existsSync(claudeDir)).toBe(false)
    expect(existsSync(join(cursorDir, 'alpha.md'))).toBe(false)
    expect(existsSync(opencodeDir)).toBe(false)
  })
})
