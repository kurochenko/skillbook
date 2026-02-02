import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { runCli } from '@/test-utils/cli'
import { initGitRepo } from '@/test-utils/git'
import { getLockFilePath, getProjectLockRoot, getLockSkillsPath } from '@/lib/lock-paths'

describe('doctor command (CLI)', () => {
  let tempDir: string
  let libraryDir: string
  let projectDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'skillbook-doctor-'))
    libraryDir = join(tempDir, '.skillbook')
    projectDir = join(tempDir, 'project')
    mkdirSync(projectDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  const env = () => ({ SKILLBOOK_LOCK_LIBRARY: libraryDir })

  test('doctor --library succeeds with lock file and skills dir', () => {
    mkdirSync(getLockSkillsPath(libraryDir), { recursive: true })
    writeFileSync(getLockFilePath(libraryDir), JSON.stringify({ schema: 1, skills: {} }, null, 2))
    initGitRepo(libraryDir)

    const result = runCli(['doctor', '--library'], env())

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('Library OK')
  })

  test('doctor --library fails when lock file is missing', () => {
    mkdirSync(getLockSkillsPath(libraryDir), { recursive: true })

    const result = runCli(['doctor', '--library'], env())

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('Missing lock file')
  })

  test('doctor --project succeeds with lock file and skills dir', () => {
    const projectRoot = getProjectLockRoot(projectDir)
    mkdirSync(getLockSkillsPath(projectRoot), { recursive: true })
    writeFileSync(getLockFilePath(projectRoot), JSON.stringify({ schema: 1, skills: {} }, null, 2))

    const result = runCli(['doctor', '--project', projectDir], env())

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('Project OK')
  })

  test('doctor --library returns exit code 2 when git is dirty', () => {
    mkdirSync(getLockSkillsPath(libraryDir), { recursive: true })
    writeFileSync(getLockFilePath(libraryDir), JSON.stringify({ schema: 1, skills: {} }, null, 2))
    initGitRepo(libraryDir)

    writeFileSync(getLockFilePath(libraryDir), JSON.stringify({ schema: 1, skills: { a: { version: 1, hash: 'x' } } }, null, 2))

    const result = runCli(['doctor', '--library'], env())

    expect(result.exitCode).toBe(2)
    expect(result.output).toContain('uncommitted changes')
  })
})
