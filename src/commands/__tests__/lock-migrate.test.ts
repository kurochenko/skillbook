import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
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

describe('migrate command (CLI)', () => {
  let tempDir: string
  let projectDir: string
  let legacyLibraryDir: string
  let lockLibraryDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'skillbook-migrate-'))
    projectDir = join(tempDir, 'project')
    legacyLibraryDir = join(tempDir, '.skillbook')
    lockLibraryDir = join(tempDir, '.SB')
    mkdirSync(projectDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  const hashSkill = (content: string) => {
    const hash = createHash('sha256')
    hash.update(`${SKILL_FILE}\n`)
    hash.update(content.replace(/\r\n/g, '\n'))
    return `sha256:${hash.digest('hex')}`
  }

  const env = () => ({
    SKILLBOOK_LEGACY_LIBRARY: legacyLibraryDir,
    SKILLBOOK_LOCK_LIBRARY: lockLibraryDir,
  })

  test('migrate copies legacy .skillbook skills into .SB and writes lock entries', () => {
    const legacyDir = join(projectDir, '.skillbook', 'skills', 'alpha')
    mkdirSync(legacyDir, { recursive: true })
    writeFileSync(join(legacyDir, SKILL_FILE), '# Alpha v1\n', 'utf-8')

    const result = runCli(['migrate', '--project', projectDir])

    expect(result.exitCode).toBe(0)
    const projectRoot = getProjectLockRoot(projectDir)
    const migratedSkill = join(getLockSkillsPath(projectRoot), 'alpha', SKILL_FILE)
    expect(existsSync(migratedSkill)).toBe(true)

    const lock = JSON.parse(readFileSync(getLockFilePath(projectRoot), 'utf-8')) as LockFile
    expect(lock.skills.alpha).toEqual({ version: 1, hash: hashSkill('# Alpha v1\n') })
  })

  test('migrate --library copies legacy library into lock-based library', () => {
    const legacyDir = join(legacyLibraryDir, 'skills', 'alpha')
    mkdirSync(legacyDir, { recursive: true })
    writeFileSync(join(legacyDir, SKILL_FILE), '# Alpha v1\n', 'utf-8')

    const result = runCli(['migrate', '--library'], env())

    expect(result.exitCode).toBe(0)
    const migratedSkill = join(getLockSkillsPath(lockLibraryDir), 'alpha', SKILL_FILE)
    expect(existsSync(migratedSkill)).toBe(true)

    const lock = JSON.parse(readFileSync(getLockFilePath(lockLibraryDir), 'utf-8')) as LockFile
    expect(lock.skills.alpha).toEqual({ version: 1, hash: hashSkill('# Alpha v1\n') })
  })
})
