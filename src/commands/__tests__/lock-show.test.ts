import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs'
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

type ShowOutput = {
  scope: 'project' | 'library'
  id: string
  hash: string
  entry: LockEntry | null
}

describe('show command (CLI)', () => {
  let tempDir: string
  let libraryDir: string
  let projectDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'skillbook-show-'))
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

  const writeLockEntry = (root: string, skillId: string, entry: LockEntry) => {
    mkdirSync(root, { recursive: true })
    writeFileSync(
      getLockFilePath(root),
      JSON.stringify({ schema: 1, skills: { [skillId]: entry } }, null, 2) + '\n',
      'utf-8',
    )
  }

  const parseJson = (output: string) => JSON.parse(output) as ShowOutput

  test('shows project hash and lock entry', () => {
    const content = '# Alpha\n'
    const hash = hashSkill(content)
    const projectRoot = getProjectLockRoot(projectDir)

    writeSkill(projectRoot, 'alpha', content)
    writeLockEntry(projectRoot, 'alpha', { version: 1, hash })

    const result = runCli(['show', 'alpha', '--project', projectDir, '--json'], env())

    expect(result.exitCode).toBe(0)
    const data = parseJson(result.stdout)
    expect(data.scope).toBe('project')
    expect(data.id).toBe('alpha')
    expect(data.hash).toBe(hash)
    expect(data.entry).toEqual({ version: 1, hash })
  })

  test('shows library hash and lock entry', () => {
    const content = '# Alpha\n'
    const hash = hashSkill(content)

    writeSkill(libraryDir, 'alpha', content)
    writeLockEntry(libraryDir, 'alpha', { version: 2, hash })

    const result = runCli(['show', 'alpha', '--library', '--json'], env())

    expect(result.exitCode).toBe(0)
    const data = parseJson(result.stdout)
    expect(data.scope).toBe('library')
    expect(data.id).toBe('alpha')
    expect(data.hash).toBe(hash)
    expect(data.entry).toEqual({ version: 2, hash })
  })
})
