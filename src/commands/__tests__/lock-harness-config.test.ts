import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  readFileSync,
  existsSync,
  writeFileSync,
  lstatSync,
  readlinkSync,
} from 'fs'
import { tmpdir } from 'os'
import { join, dirname, relative } from 'path'
import { runCli } from '@/test-utils/cli'
import { SKILL_FILE } from '@/constants'
import { getLockFilePath, getLockSkillsPath, getProjectLockRoot } from '@/lib/lock-paths'

type LockFile = {
  schema: 1
  skills: Record<string, { version: number; hash: string; updatedAt?: string }>
  harnesses?: string[]
}

describe('lock-based harness enable/disable (CLI)', () => {
  let tempDir: string
  let projectDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'skillbook-harness-config-'))
    projectDir = join(tempDir, 'project')
    mkdirSync(projectDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  const readProjectLock = () => {
    const lockPath = getLockFilePath(getProjectLockRoot(projectDir))
    const content = readFileSync(lockPath, 'utf-8')
    return JSON.parse(content) as LockFile
  }

  const writeProjectSkill = (id: string, content: string) => {
    const skillDir = join(getLockSkillsPath(getProjectLockRoot(projectDir)), id)
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(join(skillDir, SKILL_FILE), content, 'utf-8')
  }

  const expectSymlink = (path: string, target: string) => {
    expect(lstatSync(path).isSymbolicLink()).toBe(true)
    expect(readlinkSync(path)).toBe(relative(dirname(path), target))
  }

  test('harness list prints supported ids', () => {
    const result = runCli(['harness', 'list'])

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('claude-code')
    expect(result.output).toContain('codex')
    expect(result.output).toContain('cursor')
    expect(result.output).toContain('opencode')
  })

  test('harness enable writes harnesses to project lock file', () => {
    runCli(['init', '--project', '--path', projectDir])
    writeProjectSkill('alpha', '# Alpha\n')

    const result = runCli(['harness', 'enable', '--id', 'opencode', '--project', projectDir])

    expect(result.exitCode).toBe(0)
    const lock = readProjectLock()
    expect(lock.harnesses).toEqual(['opencode'])
    const symlinkPath = join(projectDir, '.opencode', 'skill', 'alpha')
    const targetPath = join(getLockSkillsPath(getProjectLockRoot(projectDir)), 'alpha')
    expectSymlink(symlinkPath, targetPath)
  })

  test('harness enable links codex harness', () => {
    runCli(['init', '--project', '--path', projectDir])
    writeProjectSkill('alpha', '# Alpha\n')

    const result = runCli(['harness', 'enable', '--id', 'codex', '--project', projectDir])

    expect(result.exitCode).toBe(0)
    const lock = readProjectLock()
    expect(lock.harnesses).toEqual(['codex'])
    const symlinkPath = join(projectDir, '.codex', 'skills', 'alpha')
    const targetPath = join(getLockSkillsPath(getProjectLockRoot(projectDir)), 'alpha')
    expectSymlink(symlinkPath, targetPath)
  })

  test('harness disable removes harness from project lock file', () => {
    runCli(['init', '--project', '--path', projectDir])
    writeProjectSkill('alpha', '# Alpha\n')
    runCli(['harness', 'enable', '--id', 'opencode', '--project', projectDir])
    runCli(['harness', 'enable', '--id', 'cursor', '--project', projectDir])

    const result = runCli(['harness', 'disable', '--id', 'opencode', '--project', projectDir])

    expect(result.exitCode).toBe(0)
    const lock = readProjectLock()
    expect(lock.harnesses).toEqual(['cursor'])
    const symlinkPath = join(projectDir, '.opencode', 'skill', 'alpha')
    expect(existsSync(symlinkPath)).toBe(false)
  })

  test('harness enable is idempotent', () => {
    runCli(['init', '--project', '--path', projectDir])
    writeProjectSkill('alpha', '# Alpha\n')
    runCli(['harness', 'enable', '--id', 'opencode', '--project', projectDir])

    const result = runCli(['harness', 'enable', '--id', 'opencode', '--project', projectDir])

    expect(result.exitCode).toBe(0)
    const lock = readProjectLock()
    expect(lock.harnesses).toEqual(['opencode'])
    const symlinkPath = join(projectDir, '.opencode', 'skill', 'alpha')
    const targetPath = join(getLockSkillsPath(getProjectLockRoot(projectDir)), 'alpha')
    expectSymlink(symlinkPath, targetPath)
  })

  test('harness disable --remove deletes harness folder', () => {
    runCli(['init', '--project', '--path', projectDir])
    runCli(['harness', 'enable', '--id', 'opencode', '--project', projectDir])

    const result = runCli([
      'harness',
      'disable',
      '--id',
      'opencode',
      '--project',
      projectDir,
      '--remove',
    ])

    expect(result.exitCode).toBe(0)
    const lock = readProjectLock()
    expect(lock.harnesses).toEqual([])
    expect(existsSync(join(projectDir, '.opencode', 'skill'))).toBe(false)
  })
})
