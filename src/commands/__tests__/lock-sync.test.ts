import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
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

describe('lock-based sync commands (CLI)', () => {
  let tempDir: string
  let libraryDir: string
  let projectDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'skillbook-lock-sync-'))
    libraryDir = join(tempDir, '.SB')
    projectDir = join(tempDir, 'project')
    mkdirSync(projectDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  const env = () => ({ SKILLBOOK_LOCK_LIBRARY: libraryDir })

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

  const writeSkillFiles = (root: string, skillId: string, files: Record<string, string>) => {
    const skillsPath = getLockSkillsPath(root)
    for (const [relativePath, content] of Object.entries(files)) {
      const filePath = join(skillsPath, skillId, relativePath)
      mkdirSync(dirname(filePath), { recursive: true })
      writeFileSync(filePath, content, 'utf-8')
    }
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

  const readSkillFile = (root: string, skillId: string, relativePath: string) =>
    readFileSync(join(getLockSkillsPath(root), skillId, relativePath), 'utf-8')

  const projectRoot = () => getProjectLockRoot(projectDir)

  const runInit = () => {
    runCli(['init', '--library'], env())
    runCli(['init', '--project', '--path', projectDir], env())
  }

  test('install copies library skill and writes lock entry', () => {
    runInit()
    const files = {
      [SKILL_FILE]: '# Alpha v1\n',
      'notes.md': 'Notes v1\n',
    }
    const hash = hashSkill(files)

    writeSkillFiles(libraryDir, 'alpha', files)
    writeLockFile(libraryDir, { alpha: { version: 1, hash } })

    const result = runCli(['install', 'alpha', '--project', projectDir], env())
    expect(result.exitCode).toBe(0)

    expect(readSkillFile(projectRoot(), 'alpha', SKILL_FILE)).toBe(files[SKILL_FILE])
    expect(readSkillFile(projectRoot(), 'alpha', 'notes.md')).toBe(files['notes.md'])

    const projectLock = readLockFile(projectRoot())
    expect(projectLock.skills.alpha).toEqual({ version: 1, hash })
  })

  test('pull updates project when behind', () => {
    runInit()
    const baseFiles = { [SKILL_FILE]: '# Alpha v1\n' }
    const updatedFiles = { [SKILL_FILE]: '# Alpha v2\n' }
    const baseHash = hashSkill(baseFiles)
    const updatedHash = hashSkill(updatedFiles)

    writeSkillFiles(libraryDir, 'alpha', updatedFiles)
    writeLockFile(libraryDir, { alpha: { version: 2, hash: updatedHash } })

    writeSkillFiles(projectRoot(), 'alpha', baseFiles)
    writeLockFile(projectRoot(), { alpha: { version: 1, hash: baseHash } })

    const result = runCli(['pull', 'alpha', '--project', projectDir], env())
    expect(result.exitCode).toBe(0)

    expect(readSkillFile(projectRoot(), 'alpha', SKILL_FILE)).toBe(updatedFiles[SKILL_FILE])
    const projectLock = readLockFile(projectRoot())
    expect(projectLock.skills.alpha).toEqual({ version: 2, hash: updatedHash })
  })

  test('push updates library when ahead and bumps version', () => {
    runInit()
    const baseFiles = { [SKILL_FILE]: '# Alpha v1\n' }
    const updatedFiles = { [SKILL_FILE]: '# Alpha v2 local\n' }
    const baseHash = hashSkill(baseFiles)
    const updatedHash = hashSkill(updatedFiles)

    writeSkillFiles(libraryDir, 'alpha', baseFiles)
    writeLockFile(libraryDir, { alpha: { version: 1, hash: baseHash } })

    writeSkillFiles(projectRoot(), 'alpha', updatedFiles)
    writeLockFile(projectRoot(), { alpha: { version: 1, hash: baseHash } })

    const result = runCli(['push', 'alpha', '--project', projectDir], env())
    expect(result.exitCode).toBe(0)

    expect(readSkillFile(libraryDir, 'alpha', SKILL_FILE)).toBe(updatedFiles[SKILL_FILE])
    const libraryLock = readLockFile(libraryDir)
    expect(libraryLock.skills.alpha).toEqual({ version: 2, hash: updatedHash })

    const projectLock = readLockFile(projectRoot())
    expect(projectLock.skills.alpha).toEqual({ version: 2, hash: updatedHash })
  })

  test('push returns conflict when library advanced and project changed', () => {
    runInit()
    const baseFiles = { [SKILL_FILE]: '# Alpha v1\n' }
    const localFiles = { [SKILL_FILE]: '# Alpha v2 local\n' }
    const remoteFiles = { [SKILL_FILE]: '# Alpha v2 remote\n' }
    const baseHash = hashSkill(baseFiles)
    const remoteHash = hashSkill(remoteFiles)

    writeSkillFiles(libraryDir, 'alpha', remoteFiles)
    writeLockFile(libraryDir, { alpha: { version: 2, hash: remoteHash } })

    writeSkillFiles(projectRoot(), 'alpha', localFiles)
    writeLockFile(projectRoot(), { alpha: { version: 1, hash: baseHash } })

    const result = runCli(['push', 'alpha', '--project', projectDir], env())
    expect(result.exitCode).toBe(2)

    expect(readSkillFile(libraryDir, 'alpha', SKILL_FILE)).toBe(remoteFiles[SKILL_FILE])
    const libraryLock = readLockFile(libraryDir)
    expect(libraryLock.skills.alpha).toEqual({ version: 2, hash: remoteHash })
  })

  test('push creates library entry for local-only skill', () => {
    runInit()
    const files = { [SKILL_FILE]: '# Alpha v1\n' }
    const hash = hashSkill(files)

    writeSkillFiles(projectRoot(), 'alpha', files)
    writeLockFile(projectRoot(), { alpha: { version: 1, hash } })
    writeLockFile(libraryDir, {})

    const result = runCli(['push', 'alpha', '--project', projectDir], env())
    expect(result.exitCode).toBe(0)

    expect(readSkillFile(libraryDir, 'alpha', SKILL_FILE)).toBe(files[SKILL_FILE])
    const libraryLock = readLockFile(libraryDir)
    expect(libraryLock.skills.alpha).toEqual({ version: 1, hash })
  })
})
