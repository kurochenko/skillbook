import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createHash } from 'crypto'
import { runCli } from '@/test-utils/cli'
import { SKILL_FILE } from '@/constants'

type LockFile = {
  schema: 1
  skills: Record<string, { version: number; hash: string; updatedAt?: string }>
}

describe('lock-aware add command (CLI)', () => {
  let tempDir: string
  let libraryDir: string
  let fixturesDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'skillbook-lock-add-'))
    libraryDir = join(tempDir, '.skillbook')
    fixturesDir = join(tempDir, 'fixtures')
    mkdirSync(fixturesDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  const env = () => ({
    SKILLBOOK_LIBRARY: libraryDir,
    SKILLBOOK_LOCK_LIBRARY: libraryDir,
  })

  const createSkillFile = (path: string, content: string) => {
    const fullPath = join(fixturesDir, path)
    mkdirSync(join(fullPath, '..'), { recursive: true })
    writeFileSync(fullPath, content)
    return fullPath
  }

  const readLockFile = () => {
    const lockPath = join(libraryDir, 'skillbook.lock.json')
    const content = readFileSync(lockPath, 'utf-8')
    return JSON.parse(content) as LockFile
  }

  const hashSkill = (content: string) => {
    const hash = createHash('sha256')
    hash.update(`${SKILL_FILE}\n`)
    hash.update(content.replace(/\r\n/g, '\n'))
    return `sha256:${hash.digest('hex')}`
  }

  test('add writes lock entry for new skill', () => {
    const content = '# New Skill\n'
    const skillPath = createSkillFile('.claude/skills/new-skill/SKILL.md', content)

    const result = runCli(['add', skillPath], env())

    expect(result.exitCode).toBe(0)
    expect(existsSync(join(libraryDir, 'skillbook.lock.json'))).toBe(true)
    const lock = readLockFile()
    expect(lock.skills['new-skill']).toEqual({ version: 1, hash: hashSkill(content) })
  })

  test('add bumps version when overwriting with new content', () => {
    const skillPath = createSkillFile('.claude/skills/alpha/SKILL.md', '# Alpha v1\n')
    runCli(['add', skillPath], env())

    writeFileSync(skillPath, '# Alpha v2\n')
    const result = runCli(['add', skillPath, '--force'], env())

    expect(result.exitCode).toBe(0)
    const lock = readLockFile()
    expect(lock.skills.alpha).toEqual({ version: 2, hash: hashSkill('# Alpha v2\n') })
  })

  test('add keeps version when content is identical', () => {
    const content = '# Same Content\n'
    const skillPath = createSkillFile('.claude/skills/same/SKILL.md', content)
    runCli(['add', skillPath], env())

    const result = runCli(['add', skillPath], env())

    expect(result.exitCode).toBe(0)
    const lock = readLockFile()
    expect(lock.skills.same).toEqual({ version: 1, hash: hashSkill(content) })
  })
})
