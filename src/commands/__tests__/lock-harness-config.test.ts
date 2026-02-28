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
  harnessModes?: Record<string, 'symlink' | 'copy'>
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
    expect(result.output).toContain('pi')
  })

  test('CLI help documents harness status and mode options', () => {
    const result = runCli(['--help'])

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('harness status')
    expect(result.output).toContain('--mode symlink|copy')
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

  test('harness enable links pi harness', () => {
    runCli(['init', '--project', '--path', projectDir])
    writeProjectSkill('alpha', '# Alpha\n')

    const result = runCli(['harness', 'enable', '--id', 'pi', '--project', projectDir])

    expect(result.exitCode).toBe(0)
    const lock = readProjectLock()
    expect(lock.harnesses).toEqual(['pi'])
    const symlinkPath = join(projectDir, '.pi', 'skills', 'alpha')
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

  test('harness enable --mode copy writes real files and persists mode', () => {
    runCli(['init', '--project', '--path', projectDir])
    writeProjectSkill('alpha', '# Alpha\n')

    const result = runCli([
      'harness',
      'enable',
      '--id',
      'cursor',
      '--project',
      projectDir,
      '--mode',
      'copy',
    ])

    expect(result.exitCode).toBe(0)

    const lock = readProjectLock()
    expect(lock.harnesses).toEqual(['cursor'])
    expect(lock.harnessModes?.cursor).toBe('copy')

    const cursorFile = join(projectDir, '.cursor', 'rules', 'alpha.md')
    expect(existsSync(cursorFile)).toBe(true)
    expect(lstatSync(cursorFile).isSymbolicLink()).toBe(false)
    expect(readFileSync(cursorFile, 'utf-8')).toBe('# Alpha\n')
  })

  test('copy mode reports drift and requires --force to overwrite', () => {
    runCli(['init', '--project', '--path', projectDir])
    writeProjectSkill('alpha', '# Alpha canonical\n')

    runCli([
      'harness',
      'enable',
      '--id',
      'cursor',
      '--project',
      projectDir,
      '--mode',
      'copy',
    ])

    const cursorFile = join(projectDir, '.cursor', 'rules', 'alpha.md')
    writeFileSync(cursorFile, '# Drifted\n', 'utf-8')

    const status = runCli([
      'harness',
      'status',
      '--id',
      'cursor',
      '--project',
      projectDir,
      '--json',
    ])

    expect(status.exitCode).toBe(0)
    const parsed = JSON.parse(status.stdout) as {
      drifted: number
      skills: Array<{ id: string; status: string }>
    }
    expect(parsed.drifted).toBe(1)
    expect(parsed.skills).toContainEqual({ id: 'alpha', status: 'harness-drifted' })

    runCli(['harness', 'sync', '--id', 'cursor', '--project', projectDir])
    expect(readFileSync(cursorFile, 'utf-8')).toBe('# Drifted\n')

    runCli(['harness', 'sync', '--id', 'cursor', '--project', projectDir, '--force'])
    expect(readFileSync(cursorFile, 'utf-8')).toBe('# Alpha canonical\n')
  })

  test('legacy lockfile without harnessModes defaults to symlink mode', () => {
    runCli(['init', '--project', '--path', projectDir])
    writeProjectSkill('alpha', '# Alpha\n')

    const lockPath = getLockFilePath(getProjectLockRoot(projectDir))
    writeFileSync(
      lockPath,
      JSON.stringify({ schema: 1, skills: {}, harnesses: ['opencode'] }, null, 2) + '\n',
      'utf-8',
    )

    const result = runCli(['harness', 'sync', '--id', 'opencode', '--project', projectDir])
    expect(result.exitCode).toBe(0)

    const symlinkPath = join(projectDir, '.opencode', 'skill', 'alpha')
    const targetPath = join(getLockSkillsPath(getProjectLockRoot(projectDir)), 'alpha')
    expectSymlink(symlinkPath, targetPath)
  })
})
