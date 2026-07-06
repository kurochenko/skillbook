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
  symlinkSync,
} from 'fs'
import { tmpdir } from 'os'
import { join, dirname, relative } from 'path'
import { createHash } from 'crypto'
import { runCli } from '@/test-utils/cli'
import { SKILL_FILE } from '@/constants'
import { getLockFilePath, getLockSkillsPath, getProjectLockRoot } from '@/lib/paths'

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

  const env = () => ({ SKILLBOOK_LIBRARY: libraryDir })

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

  const writeLockFile = (
    root: string,
    skills: Record<string, LockEntry>,
    harnesses?: string[],
    harnessModes?: Record<string, string>,
  ) => {
    const lock: LockFile = { schema: 1, skills, harnesses, harnessModes }
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

  test('harness sync links project skills into codex harness', () => {
    runInit()
    const files = {
      [SKILL_FILE]: '# Alpha v1\n',
      'notes.md': 'Notes v1\n',
    }
    const hash = hashSkill(files)

    writeSkillFiles(projectRoot(), 'alpha', files)
    writeLockFile(projectRoot(), { alpha: { version: 1, hash } })

    const result = runCli(
      ['harness', 'sync', '--project', projectDir, '--id', 'codex'],
      env(),
    )
    expect(result.exitCode).toBe(0)

    const harnessDir = join(projectDir, '.agents', 'skills', 'alpha')
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

  test('harness sync links project skills into pi harness', () => {
    runInit()
    const files = {
      [SKILL_FILE]: '# Alpha v1\n',
      'notes.md': 'Notes v1\n',
    }
    const hash = hashSkill(files)

    writeSkillFiles(projectRoot(), 'alpha', files)
    writeLockFile(projectRoot(), { alpha: { version: 1, hash } })

    const result = runCli(
      ['harness', 'sync', '--project', projectDir, '--id', 'pi'],
      env(),
    )
    expect(result.exitCode).toBe(0)

    const harnessDir = join(projectDir, '.pi', 'skills', 'alpha')
    const targetDir = join(getLockSkillsPath(projectRoot()), 'alpha')
    expectSymlink(harnessDir, targetDir)
  })

  test('harness import copies codex skill into project and links harness', () => {
    runInit()
    const baseFiles = { [SKILL_FILE]: '# Alpha v1\n' }
    const baseHash = hashSkill(baseFiles)

    writeSkillFiles(projectRoot(), 'alpha', baseFiles)
    writeLockFile(projectRoot(), { alpha: { version: 1, hash: baseHash } })

    const harnessPath = join(projectDir, '.agents', 'skills', 'alpha')
    mkdirSync(harnessPath, { recursive: true })
    writeFileSync(join(harnessPath, SKILL_FILE), '# Alpha v2 from codex\n', 'utf-8')

    const result = runCli(
      ['harness', 'import', '--project', projectDir, '--id', 'codex'],
      env(),
    )
    expect(result.exitCode).toBe(0)

    const projectSkill = join(getLockSkillsPath(projectRoot()), 'alpha', SKILL_FILE)
    expect(readFileSync(projectSkill, 'utf-8')).toBe('# Alpha v2 from codex\n')
    const targetDir = join(getLockSkillsPath(projectRoot()), 'alpha')
    expectSymlink(harnessPath, targetDir)
  })

  test('harness import copies pi skill into project and links harness', () => {
    runInit()
    const baseFiles = { [SKILL_FILE]: '# Alpha v1\n' }
    const baseHash = hashSkill(baseFiles)

    writeSkillFiles(projectRoot(), 'alpha', baseFiles)
    writeLockFile(projectRoot(), { alpha: { version: 1, hash: baseHash } })

    const harnessPath = join(projectDir, '.pi', 'skills', 'alpha')
    mkdirSync(harnessPath, { recursive: true })
    writeFileSync(join(harnessPath, SKILL_FILE), '# Alpha v2 from pi\n', 'utf-8')

    const result = runCli(
      ['harness', 'import', '--project', projectDir, '--id', 'pi'],
      env(),
    )
    expect(result.exitCode).toBe(0)

    const projectSkill = join(getLockSkillsPath(projectRoot()), 'alpha', SKILL_FILE)
    expect(readFileSync(projectSkill, 'utf-8')).toBe('# Alpha v2 from pi\n')
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

  test('harness sync in copy mode writes directory harness files', () => {
    runInit()
    const files = {
      [SKILL_FILE]: '# Alpha v1\n',
      'notes.md': 'Notes v1\n',
    }
    const hash = hashSkill(files)

    writeSkillFiles(projectRoot(), 'alpha', files)
    writeLockFile(projectRoot(), { alpha: { version: 1, hash } })

    const result = runCli(
      ['harness', 'sync', '--project', projectDir, '--id', 'opencode', '--mode', 'copy'],
      env(),
    )
    expect(result.exitCode).toBe(0)

    const harnessDir = join(projectDir, '.opencode', 'skill', 'alpha')
    expect(existsSync(harnessDir)).toBe(true)
    expect(lstatSync(harnessDir).isSymbolicLink()).toBe(false)
    expect(readFileSync(join(harnessDir, SKILL_FILE), 'utf-8')).toBe(files[SKILL_FILE])
    expect(readFileSync(join(harnessDir, 'notes.md'), 'utf-8')).toBe(files['notes.md'])
  })

  test('harness enable --mode symlink --force replaces copied directory and file harness entries', () => {
    runInit()
    const files = {
      [SKILL_FILE]: '# Alpha v1\n',
      'notes.md': 'Notes v1\n',
    }
    const hash = hashSkill(files)

    writeSkillFiles(projectRoot(), 'alpha', files)
    writeLockFile(projectRoot(), { alpha: { version: 1, hash } })

    runCli(
      ['harness', 'enable', '--project', projectDir, '--id', 'claude-code', '--mode', 'copy'],
      env(),
    )
    runCli(
      ['harness', 'enable', '--project', projectDir, '--id', 'cursor', '--mode', 'copy'],
      env(),
    )

    const claudeHarnessDir = join(projectDir, '.claude', 'skills', 'alpha')
    const cursorFile = join(projectDir, '.cursor', 'rules', 'alpha.md')
    expect(lstatSync(claudeHarnessDir).isSymbolicLink()).toBe(false)
    expect(lstatSync(cursorFile).isSymbolicLink()).toBe(false)

    const claudeResult = runCli(
      [
        'harness',
        'enable',
        '--project',
        projectDir,
        '--id',
        'claude-code',
        '--mode',
        'symlink',
        '--force',
      ],
      env(),
    )
    const cursorResult = runCli(
      [
        'harness',
        'enable',
        '--project',
        projectDir,
        '--id',
        'cursor',
        '--mode',
        'symlink',
        '--force',
      ],
      env(),
    )
    expect(claudeResult.exitCode).toBe(0)
    expect(cursorResult.exitCode).toBe(0)

    expectSymlink(claudeHarnessDir, join(getLockSkillsPath(projectRoot()), 'alpha'))
    expectSymlink(cursorFile, join(getLockSkillsPath(projectRoot()), 'alpha', SKILL_FILE))
  })

  test('harness sync without --force reports real file conflict and preserves it', () => {
    runInit()
    const files = {
      [SKILL_FILE]: '# Alpha v1\n',
    }
    const hash = hashSkill(files)

    writeSkillFiles(projectRoot(), 'alpha', files)
    writeLockFile(projectRoot(), { alpha: { version: 1, hash } })

    const cursorDir = join(projectDir, '.cursor', 'rules')
    const cursorFile = join(cursorDir, 'alpha.md')
    mkdirSync(cursorDir, { recursive: true })
    writeFileSync(cursorFile, '# Existing cursor rule\n', 'utf-8')

    const result = runCli(
      ['harness', 'sync', '--project', projectDir, '--id', 'cursor', '--mode', 'symlink'],
      env(),
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('1 conflicting path skipped')
    expect(lstatSync(cursorFile).isSymbolicLink()).toBe(false)
    expect(readFileSync(cursorFile, 'utf-8')).toBe('# Existing cursor rule\n')
  })

  test('harness sync heals dangling symlink entries', () => {
    runInit()
    const files = {
      [SKILL_FILE]: '# Alpha v1\n',
    }
    const hash = hashSkill(files)

    writeSkillFiles(projectRoot(), 'alpha', files)
    writeLockFile(projectRoot(), { alpha: { version: 1, hash } })

    const harnessDir = join(projectDir, '.claude', 'skills')
    const harnessEntry = join(harnessDir, 'alpha')
    mkdirSync(harnessDir, { recursive: true })
    symlinkSync('missing-alpha-target', harnessEntry)
    expect(existsSync(harnessEntry)).toBe(false)
    expect(lstatSync(harnessEntry).isSymbolicLink()).toBe(true)

    const result = runCli(
      ['harness', 'sync', '--project', projectDir, '--id', 'claude-code'],
      env(),
    )
    expect(result.exitCode).toBe(0)

    expectSymlink(harnessEntry, join(getLockSkillsPath(projectRoot()), 'alpha'))
  })

  test('harness status reports drift for copied directory harness skill', () => {
    runInit()
    const files = {
      [SKILL_FILE]: '# Alpha v1\n',
      'notes.md': 'Notes v1\n',
    }
    const hash = hashSkill(files)

    writeSkillFiles(projectRoot(), 'alpha', files)
    writeLockFile(projectRoot(), { alpha: { version: 1, hash } })

    runCli(
      ['harness', 'sync', '--project', projectDir, '--id', 'opencode', '--mode', 'copy'],
      env(),
    )

    const harnessSkillFile = join(projectDir, '.opencode', 'skill', 'alpha', SKILL_FILE)
    writeFileSync(harnessSkillFile, '# Drifted\n', 'utf-8')

    const status = runCli(
      ['harness', 'status', '--project', projectDir, '--id', 'opencode', '--json'],
      env(),
    )
    expect(status.exitCode).toBe(0)

    const parsed = JSON.parse(status.stdout) as {
      drifted: number
      skills: Array<{ id: string; status: string }>
    }
    expect(parsed.drifted).toBe(1)
    expect(parsed.skills).toContainEqual({ id: 'alpha', status: 'harness-drifted' })
  })

  test('removed project skill is reported stale and sync removes dangling symlink', () => {
    runInit()
    const files = {
      [SKILL_FILE]: '# Alpha v1\n',
    }
    const hash = hashSkill(files)

    writeSkillFiles(projectRoot(), 'alpha', files)
    writeLockFile(projectRoot(), { alpha: { version: 1, hash } })

    const sync = runCli(
      ['harness', 'sync', '--project', projectDir, '--id', 'claude-code'],
      env(),
    )
    expect(sync.exitCode).toBe(0)

    const harnessEntry = join(projectDir, '.claude', 'skills', 'alpha')
    rmSync(join(getLockSkillsPath(projectRoot()), 'alpha'), { recursive: true, force: true })
    writeLockFile(projectRoot(), {})

    const staleStatus = runCli(
      ['harness', 'status', '--project', projectDir, '--id', 'claude-code', '--json'],
      env(),
    )
    expect(staleStatus.exitCode).toBe(0)
    const staleParsed = JSON.parse(staleStatus.stdout) as {
      stale: number
      skills: Array<{ id: string; status: string }>
    }
    expect(staleParsed.stale).toBe(1)
    expect(staleParsed.skills).toContainEqual({ id: 'alpha', status: 'stale' })
    expect(lstatSync(harnessEntry).isSymbolicLink()).toBe(true)

    const cleanup = runCli(
      ['harness', 'sync', '--project', projectDir, '--id', 'claude-code'],
      env(),
    )
    expect(cleanup.exitCode).toBe(0)
    expect(cleanup.stdout).toContain('removed 1 stale entry')
    expect(existsSync(harnessEntry)).toBe(false)

    const cleanStatus = runCli(
      ['harness', 'status', '--project', projectDir, '--id', 'claude-code', '--json'],
      env(),
    )
    expect(cleanStatus.exitCode).toBe(0)
    const cleanParsed = JSON.parse(cleanStatus.stdout) as {
      total: number
      stale: number
      untracked: number
      skills: Array<{ id: string; status: string }>
    }
    expect(cleanParsed.total).toBe(0)
    expect(cleanParsed.stale).toBe(0)
    expect(cleanParsed.untracked).toBe(0)
    expect(cleanParsed.skills).toEqual([])
  })

  test('hand-created directory harness skill is untracked and sync leaves it untouched', () => {
    runInit()
    writeLockFile(projectRoot(), {})

    const harnessEntry = join(projectDir, '.claude', 'skills', 'my-own')
    mkdirSync(harnessEntry, { recursive: true })
    writeFileSync(join(harnessEntry, SKILL_FILE), '# My own skill\n', 'utf-8')

    const status = runCli(
      ['harness', 'status', '--project', projectDir, '--id', 'claude-code', '--json'],
      env(),
    )
    expect(status.exitCode).toBe(0)
    const parsed = JSON.parse(status.stdout) as {
      untracked: number
      skills: Array<{ id: string; status: string }>
    }
    expect(parsed.untracked).toBe(1)
    expect(parsed.skills).toContainEqual({ id: 'my-own', status: 'untracked' })

    const sync = runCli(
      ['harness', 'sync', '--project', projectDir, '--id', 'claude-code'],
      env(),
    )
    expect(sync.exitCode).toBe(0)
    expect(readFileSync(join(harnessEntry, SKILL_FILE), 'utf-8')).toBe('# My own skill\n')

    const forceSync = runCli(
      ['harness', 'sync', '--project', projectDir, '--id', 'claude-code', '--force'],
      env(),
    )
    expect(forceSync.exitCode).toBe(0)
    expect(readFileSync(join(harnessEntry, SKILL_FILE), 'utf-8')).toBe('# My own skill\n')
  })

  test('cursor orphaned real files are untracked while orphaned symlinks are stale and removed', () => {
    runInit()
    writeLockFile(projectRoot(), {})

    const cursorDir = join(projectDir, '.cursor', 'rules')
    const untrackedFile = join(cursorDir, 'my-own.md')
    const staleFile = join(cursorDir, 'gone.md')
    const staleTarget = join(getLockSkillsPath(projectRoot()), 'gone', SKILL_FILE)
    mkdirSync(cursorDir, { recursive: true })
    writeFileSync(untrackedFile, '# My own cursor rule\n', 'utf-8')
    symlinkSync(relative(dirname(staleFile), staleTarget), staleFile)

    const status = runCli(
      ['harness', 'status', '--project', projectDir, '--id', 'cursor', '--json'],
      env(),
    )
    expect(status.exitCode).toBe(0)
    const parsed = JSON.parse(status.stdout) as {
      stale: number
      untracked: number
      skills: Array<{ id: string; status: string }>
    }
    expect(parsed.stale).toBe(1)
    expect(parsed.untracked).toBe(1)
    expect(parsed.skills).toContainEqual({ id: 'gone', status: 'stale' })
    expect(parsed.skills).toContainEqual({ id: 'my-own', status: 'untracked' })

    const sync = runCli(
      ['harness', 'sync', '--project', projectDir, '--id', 'cursor'],
      env(),
    )
    expect(sync.exitCode).toBe(0)
    expect(sync.stdout).toContain('removed 1 stale entry')
    expect(existsSync(staleFile)).toBe(false)
    expect(readFileSync(untrackedFile, 'utf-8')).toBe('# My own cursor rule\n')
  })

  test('harness sync without --id syncs all harnesses in lock.harnesses', () => {
    runInit()
    const files = {
      [SKILL_FILE]: '# Alpha v1\n',
    }
    const hash = hashSkill(files)

    writeSkillFiles(projectRoot(), 'alpha', files)
    writeLockFile(projectRoot(), { alpha: { version: 1, hash } }, ['claude-code', 'opencode'])

    const result = runCli(
      ['harness', 'sync', '--project', projectDir],
      env(),
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Synced 1 skill to claude-code')
    expect(result.stdout).toContain('Synced 1 skill to opencode')

    const claudeHarnessDir = join(projectDir, '.claude', 'skills', 'alpha')
    expect(existsSync(claudeHarnessDir)).toBe(true)
    expect(lstatSync(claudeHarnessDir).isSymbolicLink()).toBe(true)

    const opencodeHarnessDir = join(projectDir, '.opencode', 'skill', 'alpha')
    expect(existsSync(opencodeHarnessDir)).toBe(true)
    expect(lstatSync(opencodeHarnessDir).isSymbolicLink()).toBe(true)
  })

  test('harness sync without --id shows message when no harnesses in lock', () => {
    runInit()
    const files = {
      [SKILL_FILE]: '# Alpha v1\n',
    }
    const hash = hashSkill(files)

    writeSkillFiles(projectRoot(), 'alpha', files)
    writeLockFile(projectRoot(), { alpha: { version: 1, hash } }, [])

    const result = runCli(
      ['harness', 'sync', '--project', projectDir],
      env(),
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('No harnesses enabled for this project')
    expect(result.stdout).toContain('skillbook harness sync --id all')
    expect(result.stdout).toContain('skillbook harness add')
  })

  test('harness sync without --id shows message when harnesses is undefined', () => {
    runInit()
    const files = {
      [SKILL_FILE]: '# Alpha v1\n',
    }
    const hash = hashSkill(files)

    writeSkillFiles(projectRoot(), 'alpha', files)
    writeLockFile(projectRoot(), { alpha: { version: 1, hash } })

    const result = runCli(
      ['harness', 'sync', '--project', projectDir],
      env(),
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('No harnesses enabled for this project')
    expect(result.stdout).toContain('skillbook harness sync --id all')
    expect(result.stdout).toContain('skillbook harness add')
  })
})
