import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createHash } from 'crypto'
import { runCli } from '@/test-utils/cli'
import { SKILL_FILE } from '@/constants'
import { getLockFilePath, getLockSkillsPath, getProjectLockRoot } from '@/lib/lock-paths'

type LockEntry = {
  version: number
  hash: string
  updatedAt?: string
}

type LockFile = {
  schema: 1
  skills: Record<string, LockEntry>
}

describe('resolve command (CLI)', () => {
  let tempDir: string
  let libraryDir: string
  let projectDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'skillbook-resolve-'))
    libraryDir = join(tempDir, '.skillbook')
    projectDir = join(tempDir, 'project')
    mkdirSync(projectDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  const env = () => ({ SKILLBOOK_LOCK_LIBRARY: libraryDir })

  const hashSkill = (content: string) => {
    const hash = createHash('sha256')
    hash.update(`${SKILL_FILE}\n`)
    hash.update(content.replace(/\r\n/g, '\n'))
    return `sha256:${hash.digest('hex')}`
  }

  const writeSkill = (root: string, skillId: string, content: string) => {
    const skillDir = join(getLockSkillsPath(root), skillId)
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(join(skillDir, SKILL_FILE), content, 'utf-8')
  }

  const writeLockFile = (root: string, skills: Record<string, LockEntry>) => {
    const lock: LockFile = { schema: 1, skills }
    mkdirSync(root, { recursive: true })
    writeFileSync(getLockFilePath(root), JSON.stringify(lock, null, 2) + '\n', 'utf-8')
  }

  const readLockFile = (root: string) => {
    const content = readFileSync(getLockFilePath(root), 'utf-8')
    return JSON.parse(content) as LockFile
  }

  test('resolve --strategy library replaces project with library version', () => {
    const baseContent = '# Alpha v1\n'
    const localContent = '# Alpha local\n'
    const remoteContent = '# Alpha remote\n'
    const baseHash = hashSkill(baseContent)
    const remoteHash = hashSkill(remoteContent)

    writeSkill(libraryDir, 'alpha', remoteContent)
    writeLockFile(libraryDir, { alpha: { version: 2, hash: remoteHash } })

    const projectRoot = getProjectLockRoot(projectDir)
    writeSkill(projectRoot, 'alpha', localContent)
    writeLockFile(projectRoot, { alpha: { version: 1, hash: baseHash } })

    const result = runCli(
      ['resolve', 'alpha', '--project', projectDir, '--strategy', 'library'],
      env(),
    )

    expect(result.exitCode).toBe(0)
    expect(readFileSync(join(getLockSkillsPath(projectRoot), 'alpha', SKILL_FILE), 'utf-8'))
      .toBe(remoteContent)
    const projectLock = readLockFile(projectRoot)
    expect(projectLock.skills.alpha).toEqual({ version: 2, hash: remoteHash })
  })

  test('resolve --strategy project pushes project version into library', () => {
    const baseContent = '# Alpha v1\n'
    const localContent = '# Alpha local\n'
    const remoteContent = '# Alpha remote\n'
    const baseHash = hashSkill(baseContent)
    const remoteHash = hashSkill(remoteContent)
    const localHash = hashSkill(localContent)

    writeSkill(libraryDir, 'alpha', remoteContent)
    writeLockFile(libraryDir, { alpha: { version: 2, hash: remoteHash } })

    const projectRoot = getProjectLockRoot(projectDir)
    writeSkill(projectRoot, 'alpha', localContent)
    writeLockFile(projectRoot, { alpha: { version: 1, hash: baseHash } })

    const result = runCli(
      ['resolve', 'alpha', '--project', projectDir, '--strategy', 'project'],
      env(),
    )

    expect(result.exitCode).toBe(0)
    const libraryLock = readLockFile(libraryDir)
    expect(libraryLock.skills.alpha).toEqual({ version: 3, hash: localHash })
    expect(readFileSync(join(getLockSkillsPath(libraryDir), 'alpha', SKILL_FILE), 'utf-8'))
      .toBe(localContent)
  })
})
