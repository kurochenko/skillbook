import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  lstatSync,
  readlinkSync,
} from 'fs'
import { tmpdir } from 'os'
import { join, dirname, relative } from 'path'
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
    libraryDir = join(tempDir, '.skillbook')
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

  const expectSymlink = (path: string, target: string) => {
    expect(lstatSync(path).isSymbolicLink()).toBe(true)
    expect(readlinkSync(path)).toBe(relative(dirname(path), target))
  }

  test('harness sync links project skills into claude-code harness', () => {
    runInit()
    const files = {
      [SKILL_FILE]: '# Alpha v1\n',
      'notes.md': 'Notes v1\n',
    }
    const hash = hashSkill(files)

    writeSkillFiles(projectRoot(), 'alpha', files)
    writeLockFile(projectRoot(), { alpha: { version: 1, hash } })

    const result = runCli(
      ['harness', 'sync', '--project', projectDir, '--id', 'claude-code'],
      env(),
    )
    expect(result.exitCode).toBe(0)

    const harnessDir = join(projectDir, '.claude', 'skills', 'alpha')
    const targetDir = join(getLockSkillsPath(projectRoot()), 'alpha')
    expectSymlink(harnessDir, targetDir)
  })

  test('harness sync links cursor file to SKILL.md', () => {
    runInit()
    const files = {
      [SKILL_FILE]: '# Alpha v1\n',
      'notes.md': 'Notes v1\n',
    }
    const hash = hashSkill(files)

    writeSkillFiles(projectRoot(), 'alpha', files)
    writeLockFile(projectRoot(), { alpha: { version: 1, hash } })

    const result = runCli(
      ['harness', 'sync', '--project', projectDir, '--id', 'cursor'],
      env(),
    )
    expect(result.exitCode).toBe(0)

    const cursorFile = join(projectDir, '.cursor', 'rules', 'alpha.md')
    const targetFile = join(getLockSkillsPath(projectRoot()), 'alpha', SKILL_FILE)
    expectSymlink(cursorFile, targetFile)
  })

  test('harness sync links project skills into opencode harness', () => {
    runInit()
    const files = {
      [SKILL_FILE]: '# Alpha v1\n',
      'notes.md': 'Notes v1\n',
    }
    const hash = hashSkill(files)

    writeSkillFiles(projectRoot(), 'alpha', files)
    writeLockFile(projectRoot(), { alpha: { version: 1, hash } })

    const result = runCli(
      ['harness', 'sync', '--project', projectDir, '--id', 'opencode'],
      env(),
    )
    expect(result.exitCode).toBe(0)

    const harnessDir = join(projectDir, '.opencode', 'skill', 'alpha')
    const targetDir = join(getLockSkillsPath(projectRoot()), 'alpha')
    expectSymlink(harnessDir, targetDir)
  })

  test('harness import copies claude-code skill into project and links harness', () => {
    runInit()
    const baseFiles = { [SKILL_FILE]: '# Alpha v1\n' }
    const baseHash = hashSkill(baseFiles)

    writeSkillFiles(projectRoot(), 'alpha', baseFiles)
    writeLockFile(projectRoot(), { alpha: { version: 1, hash: baseHash } })

    const harnessPath = join(projectDir, '.claude', 'skills', 'alpha')
    mkdirSync(harnessPath, { recursive: true })
    writeFileSync(join(harnessPath, SKILL_FILE), '# Alpha v2 from harness\n', 'utf-8')

    const result = runCli(
      ['harness', 'import', '--project', projectDir, '--id', 'claude-code'],
      env(),
    )
    expect(result.exitCode).toBe(0)

    const projectSkill = join(getLockSkillsPath(projectRoot()), 'alpha', SKILL_FILE)
    expect(readFileSync(projectSkill, 'utf-8')).toBe('# Alpha v2 from harness\n')
    const targetDir = join(getLockSkillsPath(projectRoot()), 'alpha')
    expectSymlink(harnessPath, targetDir)
  })

  test('harness import copies cursor file into project SKILL.md and links harness', () => {
    runInit()
    const baseFiles = { [SKILL_FILE]: '# Alpha v1\n' }
    const baseHash = hashSkill(baseFiles)

    writeSkillFiles(projectRoot(), 'alpha', baseFiles)
    writeLockFile(projectRoot(), { alpha: { version: 1, hash: baseHash } })

    const cursorDir = join(projectDir, '.cursor', 'rules')
    mkdirSync(cursorDir, { recursive: true })
    writeFileSync(join(cursorDir, 'alpha.md'), '# Alpha v2 from cursor\n', 'utf-8')

    const result = runCli(
      ['harness', 'import', '--project', projectDir, '--id', 'cursor'],
      env(),
    )
    expect(result.exitCode).toBe(0)

    const projectSkill = join(getLockSkillsPath(projectRoot()), 'alpha', SKILL_FILE)
    expect(readFileSync(projectSkill, 'utf-8')).toBe('# Alpha v2 from cursor\n')
    const cursorFile = join(projectDir, '.cursor', 'rules', 'alpha.md')
    const targetFile = join(getLockSkillsPath(projectRoot()), 'alpha', SKILL_FILE)
    expectSymlink(cursorFile, targetFile)
  })

  test('harness import copies opencode skill into project and links harness', () => {
    runInit()
    const baseFiles = { [SKILL_FILE]: '# Alpha v1\n' }
    const baseHash = hashSkill(baseFiles)

    writeSkillFiles(projectRoot(), 'alpha', baseFiles)
    writeLockFile(projectRoot(), { alpha: { version: 1, hash: baseHash } })

    const harnessPath = join(projectDir, '.opencode', 'skill', 'alpha')
    mkdirSync(harnessPath, { recursive: true })
    writeFileSync(join(harnessPath, SKILL_FILE), '# Alpha v2 from opencode\n', 'utf-8')

    const result = runCli(
      ['harness', 'import', '--project', projectDir, '--id', 'opencode'],
      env(),
    )
    expect(result.exitCode).toBe(0)

    const projectSkill = join(getLockSkillsPath(projectRoot()), 'alpha', SKILL_FILE)
    expect(readFileSync(projectSkill, 'utf-8')).toBe('# Alpha v2 from opencode\n')
    const targetDir = join(getLockSkillsPath(projectRoot()), 'alpha')
    expectSymlink(harnessPath, targetDir)
  })

  test('harness import ignores missing harness folders', () => {
    runInit()
    const baseFiles = { [SKILL_FILE]: '# Alpha v1\n' }
    const baseHash = hashSkill(baseFiles)

    writeSkillFiles(projectRoot(), 'alpha', baseFiles)
    writeLockFile(projectRoot(), { alpha: { version: 1, hash: baseHash } })

    const result = runCli(
      ['harness', 'import', '--project', projectDir, '--id', 'opencode'],
      env(),
    )
    expect(result.exitCode).toBe(0)

    const projectSkill = join(getLockSkillsPath(projectRoot()), 'alpha', SKILL_FILE)
    expect(existsSync(projectSkill)).toBe(true)
    expect(readFileSync(projectSkill, 'utf-8')).toBe(baseFiles[SKILL_FILE])
  })
})
