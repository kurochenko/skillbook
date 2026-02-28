import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'fs'
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

describe('multi-file add command (CLI)', () => {
  let tempDir: string
  let libraryDir: string
  let fixturesDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'skillbook-lock-add-dir-'))
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

  const createSkillDir = (name: string, files: Record<string, string>) => {
    const dirPath = join(fixturesDir, name)
    for (const [relativePath, content] of Object.entries(files)) {
      const fullPath = join(dirPath, relativePath)
      mkdirSync(join(fullPath, '..'), { recursive: true })
      writeFileSync(fullPath, content, 'utf-8')
    }
    return dirPath
  }

  const readLockFile = () => {
    const lockPath = join(libraryDir, 'skillbook.lock.json')
    const content = readFileSync(lockPath, 'utf-8')
    return JSON.parse(content) as LockFile
  }

  const hashDir = (files: Record<string, string>) => {
    const hash = createHash('sha256')
    const entries = Object.entries(files).sort(([a], [b]) => a.localeCompare(b))
    for (const [path, content] of entries) {
      hash.update(`${path}\n`)
      hash.update(content.replace(/\r\n/g, '\n'))
    }
    return `sha256:${hash.digest('hex')}`
  }

  const librarySkillDir = (name: string) => join(libraryDir, 'skills', name)

  test('add directory copies entire tree to library', () => {
    const files = {
      [SKILL_FILE]: '# My Skill\n',
      'scripts/deploy.sh': '#!/bin/bash\necho deploy\n',
      'references/API.md': '# API Reference\n',
    }
    const dirPath = createSkillDir('my-skill', files)

    const result = runCli(['add', dirPath], env())

    expect(result.exitCode).toBe(0)
    expect(existsSync(join(librarySkillDir('my-skill'), SKILL_FILE))).toBe(true)
    expect(existsSync(join(librarySkillDir('my-skill'), 'scripts/deploy.sh'))).toBe(true)
    expect(existsSync(join(librarySkillDir('my-skill'), 'references/API.md'))).toBe(true)
    expect(readFileSync(join(librarySkillDir('my-skill'), SKILL_FILE), 'utf-8')).toBe(files[SKILL_FILE])
    expect(readFileSync(join(librarySkillDir('my-skill'), 'scripts/deploy.sh'), 'utf-8')).toBe(files['scripts/deploy.sh'])
  })

  test('add directory writes lock entry with correct hash', () => {
    const files = {
      [SKILL_FILE]: '# Hash Test\n',
      'extra.txt': 'extra content\n',
    }
    const dirPath = createSkillDir('hash-test', files)
    const expectedHash = hashDir(files)

    const result = runCli(['add', dirPath], env())

    expect(result.exitCode).toBe(0)
    const lock = readLockFile()
    expect(lock.skills['hash-test']).toEqual({ version: 1, hash: expectedHash })
  })

  test('add directory rejects directory without SKILL.md', () => {
    const dirPath = createSkillDir('no-skill', { 'readme.txt': 'no skill here\n' })

    const result = runCli(['add', dirPath], env())

    expect(result.exitCode).not.toBe(0)
    expect(result.output).toContain(SKILL_FILE)
  })

  test('add directory --name flag overrides directory name', () => {
    const files = { [SKILL_FILE]: '# Custom Name\n' }
    const dirPath = createSkillDir('original-name', files)

    const result = runCli(['add', dirPath, '--name', 'custom-name'], env())

    expect(result.exitCode).toBe(0)
    expect(existsSync(join(librarySkillDir('custom-name'), SKILL_FILE))).toBe(true)
    expect(existsSync(join(librarySkillDir('original-name'), SKILL_FILE))).toBe(false)
  })

  test('add directory update bumps version', () => {
    const v1Files = { [SKILL_FILE]: '# V1\n' }
    const v2Files = { [SKILL_FILE]: '# V2\n', 'new-file.md': '# New\n' }
    const dirPath = createSkillDir('versioned', v1Files)

    runCli(['add', dirPath], env())

    // Overwrite the fixture with v2 content
    writeFileSync(join(dirPath, SKILL_FILE), v2Files[SKILL_FILE])
    writeFileSync(join(dirPath, 'new-file.md'), v2Files['new-file.md'])

    const result = runCli(['add', dirPath, '--force'], env())

    expect(result.exitCode).toBe(0)
    const lock = readLockFile()
    expect(lock.skills.versioned.version).toBe(2)
    expect(lock.skills.versioned.hash).toBe(hashDir(v2Files))
  })

  test('add directory skips when hash is identical', () => {
    const files = { [SKILL_FILE]: '# Identical\n' }
    const dirPath = createSkillDir('identical', files)

    runCli(['add', dirPath], env())
    const result = runCli(['add', dirPath], env())

    expect(result.exitCode).toBe(0)
    const lock = readLockFile()
    expect(lock.skills.identical.version).toBe(1)
  })

  test('add single file still works (backward compat)', () => {
    const content = '# Single File\n'
    const filePath = join(fixturesDir, '.claude', 'skills', 'single', SKILL_FILE)
    mkdirSync(join(filePath, '..'), { recursive: true })
    writeFileSync(filePath, content)

    const result = runCli(['add', filePath], env())

    expect(result.exitCode).toBe(0)
    expect(existsSync(join(librarySkillDir('single'), SKILL_FILE))).toBe(true)
  })

  test('add directory with nested subdirectories copies all files', () => {
    const files = {
      [SKILL_FILE]: '# Nested Skill\n',
      'scripts/build/compile.sh': '#!/bin/bash\ncompile\n',
      'scripts/build/test.sh': '#!/bin/bash\ntest\n',
      'references/v1/API.md': '# API v1\n',
      'references/v2/API.md': '# API v2\n',
    }
    const dirPath = createSkillDir('nested', files)

    const result = runCli(['add', dirPath], env())

    expect(result.exitCode).toBe(0)
    for (const relativePath of Object.keys(files)) {
      expect(existsSync(join(librarySkillDir('nested'), relativePath))).toBe(true)
    }
  })
})
