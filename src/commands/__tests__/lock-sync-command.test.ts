import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { createHash } from 'crypto'
import { tmpdir } from 'os'
import { dirname, join, relative } from 'path'

import { SKILL_FILE } from '@/constants'
import { getLockFilePath, getLockSkillsPath, getProjectLockRoot } from '@/lib/paths'
import { runCli } from '@/test-utils/cli'

type LockEntry = {
  version: number
  hash: string
  updatedAt?: string
}

type LockFile = {
  schema: 1
  skills: Record<string, LockEntry>
  harnesses?: string[]
  harnessModes?: Record<string, 'symlink' | 'copy'>
}

describe('lock-based project sync command (CLI)', () => {
  let tempDir: string
  let libraryDir: string
  let projectDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'skillbook-lock-sync-command-'))
    libraryDir = join(tempDir, '.skillbook')
    projectDir = join(tempDir, 'project')
    mkdirSync(projectDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  const env = () => ({ SKILLBOOK_LIBRARY: libraryDir })
  const projectRoot = () => getProjectLockRoot(projectDir)

  const normalize = (content: string) => content.replace(/\r\n/g, '\n')

  const hashSkill = (files: Record<string, string>) => {
    const hash = createHash('sha256')
    const entries = Object.entries(files).sort(([a], [b]) => a.localeCompare(b))
    for (const [path, content] of entries) {
      hash.update(`${path}\n`)
      hash.update(normalize(content))
    }
    return `sha256:${hash.digest('hex')}`
  }

  const skillFiles = (content: string) => ({ [SKILL_FILE]: content })

  const writeSkillFiles = (root: string, skillId: string, files: Record<string, string>) => {
    const skillsPath = getLockSkillsPath(root)
    for (const [relativePath, content] of Object.entries(files)) {
      const filePath = join(skillsPath, skillId, relativePath)
      mkdirSync(dirname(filePath), { recursive: true })
      writeFileSync(filePath, content, 'utf-8')
    }
  }

  const writeLockFile = (
    root: string,
    skills: Record<string, LockEntry>,
    harnesses: string[] = [],
    harnessModes: Record<string, 'symlink' | 'copy'> = {},
  ) => {
    const lock: LockFile = { schema: 1, skills, harnesses, harnessModes }
    mkdirSync(root, { recursive: true })
    writeFileSync(getLockFilePath(root), JSON.stringify(lock, null, 2) + '\n', 'utf-8')
  }

  const readLockFile = (root: string) =>
    JSON.parse(readFileSync(getLockFilePath(root), 'utf-8')) as LockFile

  const readSkill = (root: string, skillId: string) =>
    readFileSync(join(getLockSkillsPath(root), skillId, SKILL_FILE), 'utf-8')

  const expectSymlink = (path: string, target: string) => {
    expect(lstatSync(path).isSymbolicLink()).toBe(true)
    expect(readlinkSync(path)).toBe(relative(dirname(path), target))
  }

  const runInit = () => {
    runCli(['init', '--library'], env())
    runCli(['init', '--project', '--path', projectDir], env())
  }

  const setupMixedProject = () => {
    runInit()

    const alphaBase = skillFiles('# Alpha v1\n')
    const alphaRemote = skillFiles('# Alpha v2 library\n')
    const betaBase = skillFiles('# Beta v1\n')
    const betaLocal = skillFiles('# Beta v2 local\n')
    const gammaBase = skillFiles('# Gamma v1\n')
    const gammaRemote = skillFiles('# Gamma v2 library\n')
    const gammaLocal = skillFiles('# Gamma v2 local\n')
    const localOnly = skillFiles('# Local only\n')

    writeSkillFiles(libraryDir, 'alpha', alphaRemote)
    writeSkillFiles(libraryDir, 'beta', betaBase)
    writeSkillFiles(libraryDir, 'gamma', gammaRemote)
    writeLockFile(libraryDir, {
      alpha: { version: 2, hash: hashSkill(alphaRemote) },
      beta: { version: 1, hash: hashSkill(betaBase) },
      gamma: { version: 2, hash: hashSkill(gammaRemote) },
    })

    writeSkillFiles(projectRoot(), 'alpha', alphaBase)
    writeSkillFiles(projectRoot(), 'beta', betaLocal)
    writeSkillFiles(projectRoot(), 'gamma', gammaLocal)
    writeSkillFiles(projectRoot(), 'delta', localOnly)
    writeLockFile(
      projectRoot(),
      {
        alpha: { version: 1, hash: hashSkill(alphaBase) },
        beta: { version: 1, hash: hashSkill(betaBase) },
        gamma: { version: 1, hash: hashSkill(gammaBase) },
      },
      ['codex'],
      { codex: 'symlink' },
    )

    return { alphaRemote, betaLocal, gammaLocal }
  }

  test('pulls behind skills, leaves unsafe states untouched, syncs harnesses, and exits 2 for diverged', () => {
    const { alphaRemote, betaLocal, gammaLocal } = setupMixedProject()

    const result = runCli(['sync', '--project', projectDir], env())

    expect(result.exitCode).toBe(2)
    expect(result.stdout).toContain('Pulled alpha')
    expect(result.stdout).toContain('beta: ahead (push when ready)')
    expect(result.stdout).toContain("gamma: diverged (run 'skillbook resolve gamma --strategy library|project')")
    expect(result.stdout).toContain("delta: local-only (run 'skillbook push delta' to publish)")
    expect(result.stdout).toContain('codex: synced')

    expect(readSkill(projectRoot(), 'alpha')).toBe(alphaRemote[SKILL_FILE])
    expect(readSkill(projectRoot(), 'beta')).toBe(betaLocal[SKILL_FILE])
    expect(readSkill(projectRoot(), 'gamma')).toBe(gammaLocal[SKILL_FILE])

    const projectLock = readLockFile(projectRoot())
    expect(projectLock.skills.alpha).toMatchObject({
      version: 2,
      hash: hashSkill(alphaRemote),
    })

    const harnessLink = join(projectDir, '.agents', 'skills', 'alpha')
    const target = join(getLockSkillsPath(projectRoot()), 'alpha')
    expectSymlink(harnessLink, target)
  })

  test('--dry-run reports planned work without changing skills or harnesses', () => {
    const { betaLocal, gammaLocal } = setupMixedProject()
    const beforeLock = readFileSync(getLockFilePath(projectRoot()), 'utf-8')

    const result = runCli(['sync', '--project', projectDir, '--dry-run'], env())

    expect(result.exitCode).toBe(2)
    expect(result.stdout).toContain('Would pull alpha')
    expect(result.stdout).toContain('codex current:')
    expect(readSkill(projectRoot(), 'alpha')).toBe('# Alpha v1\n')
    expect(readSkill(projectRoot(), 'beta')).toBe(betaLocal[SKILL_FILE])
    expect(readSkill(projectRoot(), 'gamma')).toBe(gammaLocal[SKILL_FILE])
    expect(readFileSync(getLockFilePath(projectRoot()), 'utf-8')).toBe(beforeLock)
    expect(existsSync(join(projectDir, '.agents', 'skills', 'alpha'))).toBe(false)
  })

  test('--json returns machine-readable sync result', () => {
    setupMixedProject()

    const result = runCli(['sync', '--project', projectDir, '--json'], env())

    expect(result.exitCode).toBe(2)
    const data = JSON.parse(result.stdout) as {
      ok: boolean
      skills: Array<{ id: string; status: string; action: string }>
      harnesses: Array<{
        id: string
        synced: number
        drifted: number
        conflicts: number
        removedStale: number
        mode: string
      }>
    }

    expect(data.ok).toBe(false)
    expect(data.skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'alpha', status: 'behind', action: 'pulled' }),
        expect.objectContaining({ id: 'beta', status: 'ahead', action: 'ahead' }),
        expect.objectContaining({ id: 'gamma', status: 'diverged', action: 'diverged' }),
        expect.objectContaining({ id: 'delta', status: 'local-only', action: 'local-only' }),
      ]),
    )
    expect(data.harnesses).toHaveLength(1)
    expect(data.harnesses[0]).toMatchObject({
      id: 'codex',
      drifted: 0,
      conflicts: 0,
      removedStale: 0,
      mode: 'symlink',
    })
    expect(typeof data.harnesses[0]?.synced).toBe('number')
  })
})
