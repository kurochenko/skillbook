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

describe('lock-based harness sync (CLI)', () => {
  let tempDir: string
  let libraryDir: string
  let projectDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'skillbook-lock-harness-'))
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

  const projectRoot = () => getProjectLockRoot(projectDir)

  const runInit = () => {
    runCli(['init', '--library'], env())
    runCli(['init', '--project', '--path', projectDir], env())
  }

  test('harness sync copies project skills into claude-code harness', () => {
    runInit()
    const files = {
      [SKILL_FILE]: '# Alpha v1\n',
      'notes.md': 'Notes v1\n',
    }
    const hash = hashSkill(files)

    writeSkillFiles(projectRoot(), 'alpha', files)
    writeLockFile(projectRoot(), { alpha: { version: 1, hash } })

    const result = runCli(
      ['harness', 'sync', '--project', projectDir, '--harness', 'claude-code'],
      env(),
    )
    expect(result.exitCode).toBe(0)

    const harnessDir = join(projectDir, '.claude', 'skills', 'alpha')
    expect(readFileSync(join(harnessDir, SKILL_FILE), 'utf-8')).toBe(files[SKILL_FILE])
    expect(readFileSync(join(harnessDir, 'notes.md'), 'utf-8')).toBe(files['notes.md'])
  })

  test('harness sync writes cursor file from SKILL.md', () => {
    runInit()
    const files = {
      [SKILL_FILE]: '# Alpha v1\n',
      'notes.md': 'Notes v1\n',
    }
    const hash = hashSkill(files)

    writeSkillFiles(projectRoot(), 'alpha', files)
    writeLockFile(projectRoot(), { alpha: { version: 1, hash } })

    const result = runCli(
      ['harness', 'sync', '--project', projectDir, '--harness', 'cursor'],
      env(),
    )
    expect(result.exitCode).toBe(0)

    const cursorFile = join(projectDir, '.cursor', 'rules', 'alpha.md')
    expect(readFileSync(cursorFile, 'utf-8')).toBe(files[SKILL_FILE])
  })

  test('harness sync copies project skills into opencode harness', () => {
    runInit()
    const files = {
      [SKILL_FILE]: '# Alpha v1\n',
      'notes.md': 'Notes v1\n',
    }
    const hash = hashSkill(files)

    writeSkillFiles(projectRoot(), 'alpha', files)
    writeLockFile(projectRoot(), { alpha: { version: 1, hash } })

    const result = runCli(
      ['harness', 'sync', '--project', projectDir, '--harness', 'opencode'],
      env(),
    )
    expect(result.exitCode).toBe(0)

    const harnessDir = join(projectDir, '.opencode', 'skill', 'alpha')
    expect(readFileSync(join(harnessDir, SKILL_FILE), 'utf-8')).toBe(files[SKILL_FILE])
    expect(readFileSync(join(harnessDir, 'notes.md'), 'utf-8')).toBe(files['notes.md'])
  })

  test('harness import copies claude-code skill into project', () => {
    runInit()
    const baseFiles = { [SKILL_FILE]: '# Alpha v1\n' }
    const baseHash = hashSkill(baseFiles)

    writeSkillFiles(projectRoot(), 'alpha', baseFiles)
    writeLockFile(projectRoot(), { alpha: { version: 1, hash: baseHash } })

    const harnessDir = join(projectDir, '.claude', 'skills', 'alpha')
    mkdirSync(harnessDir, { recursive: true })
    writeFileSync(join(harnessDir, SKILL_FILE), '# Alpha v2 from harness\n', 'utf-8')

    const result = runCli(
      ['harness', 'import', '--project', projectDir, '--harness', 'claude-code'],
      env(),
    )
    expect(result.exitCode).toBe(0)

    const projectSkill = join(getLockSkillsPath(projectRoot()), 'alpha', SKILL_FILE)
    expect(readFileSync(projectSkill, 'utf-8')).toBe('# Alpha v2 from harness\n')
  })

  test('harness import copies cursor file into project SKILL.md', () => {
    runInit()
    const baseFiles = { [SKILL_FILE]: '# Alpha v1\n' }
    const baseHash = hashSkill(baseFiles)

    writeSkillFiles(projectRoot(), 'alpha', baseFiles)
    writeLockFile(projectRoot(), { alpha: { version: 1, hash: baseHash } })

    const cursorDir = join(projectDir, '.cursor', 'rules')
    mkdirSync(cursorDir, { recursive: true })
    writeFileSync(join(cursorDir, 'alpha.md'), '# Alpha v2 from cursor\n', 'utf-8')

    const result = runCli(
      ['harness', 'import', '--project', projectDir, '--harness', 'cursor'],
      env(),
    )
    expect(result.exitCode).toBe(0)

    const projectSkill = join(getLockSkillsPath(projectRoot()), 'alpha', SKILL_FILE)
    expect(readFileSync(projectSkill, 'utf-8')).toBe('# Alpha v2 from cursor\n')
  })

  test('harness import copies opencode skill into project', () => {
    runInit()
    const baseFiles = { [SKILL_FILE]: '# Alpha v1\n' }
    const baseHash = hashSkill(baseFiles)

    writeSkillFiles(projectRoot(), 'alpha', baseFiles)
    writeLockFile(projectRoot(), { alpha: { version: 1, hash: baseHash } })

    const harnessDir = join(projectDir, '.opencode', 'skill', 'alpha')
    mkdirSync(harnessDir, { recursive: true })
    writeFileSync(join(harnessDir, SKILL_FILE), '# Alpha v2 from opencode\n', 'utf-8')

    const result = runCli(
      ['harness', 'import', '--project', projectDir, '--harness', 'opencode'],
      env(),
    )
    expect(result.exitCode).toBe(0)

    const projectSkill = join(getLockSkillsPath(projectRoot()), 'alpha', SKILL_FILE)
    expect(readFileSync(projectSkill, 'utf-8')).toBe('# Alpha v2 from opencode\n')
  })

  test('harness import ignores missing harness folders', () => {
    runInit()
    const baseFiles = { [SKILL_FILE]: '# Alpha v1\n' }
    const baseHash = hashSkill(baseFiles)

    writeSkillFiles(projectRoot(), 'alpha', baseFiles)
    writeLockFile(projectRoot(), { alpha: { version: 1, hash: baseHash } })

    const result = runCli(
      ['harness', 'import', '--project', projectDir, '--harness', 'opencode'],
      env(),
    )
    expect(result.exitCode).toBe(0)

    const projectSkill = join(getLockSkillsPath(projectRoot()), 'alpha', SKILL_FILE)
    expect(existsSync(projectSkill)).toBe(true)
    expect(readFileSync(projectSkill, 'utf-8')).toBe(baseFiles[SKILL_FILE])
  })
})
