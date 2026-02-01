import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { runCli } from '@/test-utils/cli'
import { getLockFilePath, getProjectLockRoot } from '@/lib/lock-paths'

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

  test('harness list prints supported ids', () => {
    const result = runCli(['harness', 'list'])

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('claude-code')
    expect(result.output).toContain('cursor')
    expect(result.output).toContain('opencode')
  })

  test('harness enable writes harnesses to project lock file', () => {
    runCli(['init', '--project', '--path', projectDir])

    const result = runCli(['harness', 'enable', '--id', 'opencode', '--project', projectDir])

    expect(result.exitCode).toBe(0)
    const lock = readProjectLock()
    expect(lock.harnesses).toEqual(['opencode'])
    expect(existsSync(join(projectDir, '.opencode', 'skill'))).toBe(true)
  })

  test('harness disable removes harness from project lock file', () => {
    runCli(['init', '--project', '--path', projectDir])
    runCli(['harness', 'enable', '--id', 'opencode', '--project', projectDir])
    runCli(['harness', 'enable', '--id', 'cursor', '--project', projectDir])

    const result = runCli(['harness', 'disable', '--id', 'opencode', '--project', projectDir])

    expect(result.exitCode).toBe(0)
    const lock = readProjectLock()
    expect(lock.harnesses).toEqual(['cursor'])
    expect(existsSync(join(projectDir, '.opencode', 'skill'))).toBe(true)
  })

  test('harness enable is idempotent', () => {
    runCli(['init', '--project', '--path', projectDir])
    runCli(['harness', 'enable', '--id', 'opencode', '--project', projectDir])

    const result = runCli(['harness', 'enable', '--id', 'opencode', '--project', projectDir])

    expect(result.exitCode).toBe(0)
    const lock = readProjectLock()
    expect(lock.harnesses).toEqual(['opencode'])
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
