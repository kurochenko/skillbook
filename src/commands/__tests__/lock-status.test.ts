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

describe('lock-based workflow (CLI)', () => {
  let tempDir: string
  let libraryDir: string
  let projectDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'skillbook-lock-cli-'))
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

  const hashFromContent = (content: string) =>
    hashSkill({ [SKILL_FILE]: content })

  const writeSkill = (root: string, skillId: string, content: string) => {
    const skillDir = join(getLockSkillsPath(root), skillId)
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(join(skillDir, SKILL_FILE), content, 'utf-8')
  }

  const writeLockFile = (root: string, skills: Record<string, LockEntry>) => {
    mkdirSync(root, { recursive: true })
    const lock: LockFile = { schema: 1, skills }
    writeFileSync(getLockFilePath(root), JSON.stringify(lock, null, 2) + '\n', 'utf-8')
  }

  const projectRoot = () => getProjectLockRoot(projectDir)

  const parseStatus = (output: string) => JSON.parse(output) as {
    skills: Array<{
      id: string
      status: string
      project?: { version?: number; hash?: string } | null
      library?: { version?: number; hash?: string } | null
    }>
  }

  describe('init', () => {
    test('init --library creates .SB library structure', () => {
      const result = runCli(['init', '--library'], env())

      expect(result.exitCode).toBe(0)
      expect(existsSync(getLockSkillsPath(libraryDir))).toBe(true)
      const lockContents = readFileSync(getLockFilePath(libraryDir), 'utf-8')
      const lock = JSON.parse(lockContents) as LockFile
      expect(lock.schema).toBe(1)
      expect(lock.skills).toEqual({})
    })

    test('init --project creates .SB project structure', () => {
      const result = runCli(['init', '--project', '--path', projectDir], env())

      expect(result.exitCode).toBe(0)
      expect(existsSync(getLockSkillsPath(projectRoot()))).toBe(true)
      const lockContents = readFileSync(getLockFilePath(projectRoot()), 'utf-8')
      const lock = JSON.parse(lockContents) as LockFile
      expect(lock.schema).toBe(1)
      expect(lock.skills).toEqual({})
    })
  })

  describe('status', () => {
    const runStatus = () => runCli(['status', '--project', projectDir, '--json'], env())

    test('reports synced when project and library match base', () => {
      const content = '# Skill v1'
      const hash = hashFromContent(content)
      writeSkill(libraryDir, 'alpha', content)
      writeLockFile(libraryDir, { alpha: { version: 1, hash } })

      writeSkill(projectRoot(), 'alpha', content)
      writeLockFile(projectRoot(), { alpha: { version: 1, hash } })

      const result = runStatus()
      expect(result.exitCode).toBe(0)
      const data = parseStatus(result.stdout)
      expect(data.skills).toHaveLength(1)
      expect(data.skills[0]).toMatchObject({ id: 'alpha', status: 'synced' })
      expect(data.skills[0]?.project).toMatchObject({ version: 1, hash })
      expect(data.skills[0]?.library).toMatchObject({ version: 1, hash })
    })

    test('reports ahead when project changed and library did not', () => {
      const base = '# Skill v1'
      const changed = '# Skill v2'
      const baseHash = hashFromContent(base)
      writeSkill(libraryDir, 'alpha', base)
      writeLockFile(libraryDir, { alpha: { version: 1, hash: baseHash } })

      writeSkill(projectRoot(), 'alpha', changed)
      writeLockFile(projectRoot(), { alpha: { version: 1, hash: baseHash } })

      const result = runStatus()
      expect(result.exitCode).toBe(0)
      const data = parseStatus(result.stdout)
      expect(data.skills[0]).toMatchObject({ id: 'alpha', status: 'ahead' })
    })

    test('reports behind when library advanced and project did not', () => {
      const base = '# Skill v1'
      const updated = '# Skill v2'
      const baseHash = hashFromContent(base)
      const updatedHash = hashFromContent(updated)

      writeSkill(libraryDir, 'alpha', updated)
      writeLockFile(libraryDir, { alpha: { version: 2, hash: updatedHash } })

      writeSkill(projectRoot(), 'alpha', base)
      writeLockFile(projectRoot(), { alpha: { version: 1, hash: baseHash } })

      const result = runStatus()
      expect(result.exitCode).toBe(0)
      const data = parseStatus(result.stdout)
      expect(data.skills[0]).toMatchObject({ id: 'alpha', status: 'behind' })
    })

    test('reports diverged when project and library changed', () => {
      const base = '# Skill v1'
      const local = '# Skill v2 local'
      const remote = '# Skill v2 remote'
      const baseHash = hashFromContent(base)
      const remoteHash = hashFromContent(remote)

      writeSkill(libraryDir, 'alpha', remote)
      writeLockFile(libraryDir, { alpha: { version: 2, hash: remoteHash } })

      writeSkill(projectRoot(), 'alpha', local)
      writeLockFile(projectRoot(), { alpha: { version: 1, hash: baseHash } })

      const result = runStatus()
      expect(result.exitCode).toBe(0)
      const data = parseStatus(result.stdout)
      expect(data.skills[0]).toMatchObject({ id: 'alpha', status: 'diverged' })
    })

    test('reports local-only when project has skill and library does not', () => {
      const content = '# Local skill'
      writeSkill(projectRoot(), 'alpha', content)
      writeLockFile(projectRoot(), {})
      writeLockFile(libraryDir, {})

      const result = runStatus()
      expect(result.exitCode).toBe(0)
      const data = parseStatus(result.stdout)
      expect(data.skills[0]).toMatchObject({ id: 'alpha', status: 'local-only' })
    })

    test('does not list library-only skills', () => {
      const content = '# Library skill'
      const hash = hashFromContent(content)
      writeSkill(libraryDir, 'alpha', content)
      writeLockFile(libraryDir, { alpha: { version: 1, hash } })
      writeLockFile(projectRoot(), {})

      const result = runStatus()
      expect(result.exitCode).toBe(0)
      const data = parseStatus(result.stdout)
      expect(data.skills).toHaveLength(0)
    })
  })
})
