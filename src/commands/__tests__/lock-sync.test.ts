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

describe('lock-based sync commands (CLI)', () => {
  let tempDir: string
  let libraryDir: string
  let projectDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'skillbook-lock-sync-'))
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

    runCli(['harness', 'enable', '--id', 'opencode', '--project', projectDir], env())

    const result = runCli(['install', 'alpha', '--project', projectDir], env())
    expect(result.exitCode).toBe(0)

    expect(readSkillFile(projectRoot(), 'alpha', SKILL_FILE)).toBe(files[SKILL_FILE])
    expect(readSkillFile(projectRoot(), 'alpha', 'notes.md')).toBe(files['notes.md'])

    const projectLock = readLockFile(projectRoot())
    expect(projectLock.skills.alpha).toEqual({ version: 1, hash })

    const harnessLink = join(projectDir, '.opencode', 'skill', 'alpha')
    expect(lstatSync(harnessLink).isSymbolicLink()).toBe(true)
    const target = join(getLockSkillsPath(projectRoot()), 'alpha')
    expect(readlinkSync(harnessLink)).toBe(relative(dirname(harnessLink), target))
  })

  test('install --force overwrites existing skill', () => {
    runInit()
    const filesV2 = { [SKILL_FILE]: '# Alpha v2\n' }
    const hashV2 = hashSkill(filesV2)

    writeSkillFiles(libraryDir, 'alpha', filesV2)
    writeLockFile(libraryDir, { alpha: { version: 2, hash: hashV2 } })

    runCli(['harness', 'enable', '--id', 'opencode', '--project', projectDir], env())

    runCli(['install', 'alpha', '--project', projectDir], env())
    expect(readSkillFile(projectRoot(), 'alpha', SKILL_FILE)).toBe(filesV2[SKILL_FILE])

    const result = runCli(['install', 'alpha', '--force', '--project', projectDir], env())
    expect(result.exitCode).toBe(0)

    expect(readSkillFile(projectRoot(), 'alpha', SKILL_FILE)).toBe(filesV2[SKILL_FILE])
    const projectLock = readLockFile(projectRoot())
    expect(projectLock.skills.alpha).toEqual({ version: 2, hash: hashV2 })
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

  test('pull refreshes copied harness outputs in copy mode', () => {
    runInit()
    const baseFiles = { [SKILL_FILE]: '# Alpha v1\n' }
    const updatedFiles = { [SKILL_FILE]: '# Alpha v2\n' }
    const baseHash = hashSkill(baseFiles)
    const updatedHash = hashSkill(updatedFiles)

    writeSkillFiles(libraryDir, 'alpha', baseFiles)
    writeLockFile(libraryDir, { alpha: { version: 1, hash: baseHash } })

    runCli([
      'harness',
      'enable',
      '--id',
      'cursor',
      '--mode',
      'copy',
      '--project',
      projectDir,
    ], env())
    runCli(['install', 'alpha', '--project', projectDir], env())

    writeSkillFiles(libraryDir, 'alpha', updatedFiles)
    writeLockFile(libraryDir, { alpha: { version: 2, hash: updatedHash } })

    const result = runCli(['pull', 'alpha', '--project', projectDir], env())
    expect(result.exitCode).toBe(0)

    const cursorFile = join(projectDir, '.cursor', 'rules', 'alpha.md')
    expect(readFileSync(cursorFile, 'utf-8')).toBe(updatedFiles[SKILL_FILE])
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

  describe('multi-skill support', () => {
    test('install multiple skills', () => {
      runInit()
      const alphaFiles = { [SKILL_FILE]: '# Alpha v1\n' }
      const betaFiles = { [SKILL_FILE]: '# Beta v1\n' }
      const alphaHash = hashSkill(alphaFiles)
      const betaHash = hashSkill(betaFiles)

      writeSkillFiles(libraryDir, 'alpha', alphaFiles)
      writeSkillFiles(libraryDir, 'beta', betaFiles)
      writeLockFile(libraryDir, {
        alpha: { version: 1, hash: alphaHash },
        beta: { version: 1, hash: betaHash },
      })

      runCli(['harness', 'enable', '--id', 'opencode', '--project', projectDir], env())

      const result = runCli(['install', '--skills', 'alpha,beta', '--project', projectDir], env())
      expect(result.exitCode).toBe(0)

      expect(readSkillFile(projectRoot(), 'alpha', SKILL_FILE)).toBe(alphaFiles[SKILL_FILE])
      expect(readSkillFile(projectRoot(), 'beta', SKILL_FILE)).toBe(betaFiles[SKILL_FILE])

      const projectLock = readLockFile(projectRoot())
      expect(projectLock.skills.alpha).toEqual({ version: 1, hash: alphaHash })
      expect(projectLock.skills.beta).toEqual({ version: 1, hash: betaHash })
    })

    test('install merges positional and --skills', () => {
      runInit()
      const alphaFiles = { [SKILL_FILE]: '# Alpha v1\n' }
      const betaFiles = { [SKILL_FILE]: '# Beta v1\n' }
      const gammaFiles = { [SKILL_FILE]: '# Gamma v1\n' }
      const alphaHash = hashSkill(alphaFiles)
      const betaHash = hashSkill(betaFiles)
      const gammaHash = hashSkill(gammaFiles)

      writeSkillFiles(libraryDir, 'alpha', alphaFiles)
      writeSkillFiles(libraryDir, 'beta', betaFiles)
      writeSkillFiles(libraryDir, 'gamma', gammaFiles)
      writeLockFile(libraryDir, {
        alpha: { version: 1, hash: alphaHash },
        beta: { version: 1, hash: betaHash },
        gamma: { version: 1, hash: gammaHash },
      })

      runCli(['harness', 'enable', '--id', 'opencode', '--project', projectDir], env())

      const result = runCli(['install', 'alpha', '--skills', 'beta,gamma', '--project', projectDir], env())
      expect(result.exitCode).toBe(0)

      expect(readSkillFile(projectRoot(), 'alpha', SKILL_FILE)).toBe(alphaFiles[SKILL_FILE])
      expect(readSkillFile(projectRoot(), 'beta', SKILL_FILE)).toBe(betaFiles[SKILL_FILE])
      expect(readSkillFile(projectRoot(), 'gamma', SKILL_FILE)).toBe(gammaFiles[SKILL_FILE])

      const projectLock = readLockFile(projectRoot())
      expect(projectLock.skills.alpha).toEqual({ version: 1, hash: alphaHash })
      expect(projectLock.skills.beta).toEqual({ version: 1, hash: betaHash })
      expect(projectLock.skills.gamma).toEqual({ version: 1, hash: gammaHash })
    })

    test('install continues on failure', () => {
      runInit()
      const alphaFiles = { [SKILL_FILE]: '# Alpha v1\n' }
      const alphaHash = hashSkill(alphaFiles)

      writeSkillFiles(libraryDir, 'alpha', alphaFiles)
      writeLockFile(libraryDir, { alpha: { version: 1, hash: alphaHash } })

      runCli(['harness', 'enable', '--id', 'opencode', '--project', projectDir], env())

      const result = runCli(['install', '--skills', 'alpha,nonexistent', '--project', projectDir], env())
      expect(result.exitCode).toBe(1)

      expect(readSkillFile(projectRoot(), 'alpha', SKILL_FILE)).toBe(alphaFiles[SKILL_FILE])
      const projectLock = readLockFile(projectRoot())
      expect(projectLock.skills.alpha).toEqual({ version: 1, hash: alphaHash })
      expect(projectLock.skills.nonexistent).toBeUndefined()
    })

    test('uninstall multiple skills', () => {
      runInit()
      const alphaFiles = { [SKILL_FILE]: '# Alpha v1\n' }
      const betaFiles = { [SKILL_FILE]: '# Beta v1\n' }
      const alphaHash = hashSkill(alphaFiles)
      const betaHash = hashSkill(betaFiles)

      writeSkillFiles(libraryDir, 'alpha', alphaFiles)
      writeSkillFiles(libraryDir, 'beta', betaFiles)
      writeLockFile(libraryDir, {
        alpha: { version: 1, hash: alphaHash },
        beta: { version: 1, hash: betaHash },
      })

      runCli(['install', '--skills', 'alpha,beta', '--project', projectDir], env())

      const result = runCli(['uninstall', '--skills', 'alpha,beta', '--project', projectDir], env())
      expect(result.exitCode).toBe(0)

      expect(existsSync(join(getLockSkillsPath(projectRoot()), 'alpha'))).toBe(false)
      expect(existsSync(join(getLockSkillsPath(projectRoot()), 'beta'))).toBe(false)

      const projectLock = readLockFile(projectRoot())
      expect(projectLock.skills.alpha).toBeUndefined()
      expect(projectLock.skills.beta).toBeUndefined()
    })

    test('pull multiple skills', () => {
      runInit()
      const alphaBase = { [SKILL_FILE]: '# Alpha v1\n' }
      const betaBase = { [SKILL_FILE]: '# Beta v1\n' }
      const alphaUpdated = { [SKILL_FILE]: '# Alpha v2\n' }
      const betaUpdated = { [SKILL_FILE]: '# Beta v2\n' }
      const alphaBaseHash = hashSkill(alphaBase)
      const betaBaseHash = hashSkill(betaBase)
      const alphaUpdatedHash = hashSkill(alphaUpdated)
      const betaUpdatedHash = hashSkill(betaUpdated)

      writeSkillFiles(libraryDir, 'alpha', alphaUpdated)
      writeSkillFiles(libraryDir, 'beta', betaUpdated)
      writeLockFile(libraryDir, {
        alpha: { version: 2, hash: alphaUpdatedHash },
        beta: { version: 2, hash: betaUpdatedHash },
      })

      writeSkillFiles(projectRoot(), 'alpha', alphaBase)
      writeSkillFiles(projectRoot(), 'beta', betaBase)
      writeLockFile(projectRoot(), {
        alpha: { version: 1, hash: alphaBaseHash },
        beta: { version: 1, hash: betaBaseHash },
      })

      const result = runCli(['pull', '--skills', 'alpha,beta', '--project', projectDir], env())
      expect(result.exitCode).toBe(0)

      expect(readSkillFile(projectRoot(), 'alpha', SKILL_FILE)).toBe(alphaUpdated[SKILL_FILE])
      expect(readSkillFile(projectRoot(), 'beta', SKILL_FILE)).toBe(betaUpdated[SKILL_FILE])

      const projectLock = readLockFile(projectRoot())
      expect(projectLock.skills.alpha).toEqual({ version: 2, hash: alphaUpdatedHash })
      expect(projectLock.skills.beta).toEqual({ version: 2, hash: betaUpdatedHash })
    })

    test('push multiple skills', () => {
      runInit()
      const alphaBase = { [SKILL_FILE]: '# Alpha v1\n' }
      const betaBase = { [SKILL_FILE]: '# Beta v1\n' }
      const alphaLocal = { [SKILL_FILE]: '# Alpha v2 local\n' }
      const betaLocal = { [SKILL_FILE]: '# Beta v2 local\n' }
      const alphaBaseHash = hashSkill(alphaBase)
      const betaBaseHash = hashSkill(betaBase)
      const alphaLocalHash = hashSkill(alphaLocal)
      const betaLocalHash = hashSkill(betaLocal)

      writeSkillFiles(libraryDir, 'alpha', alphaBase)
      writeSkillFiles(libraryDir, 'beta', betaBase)
      writeLockFile(libraryDir, {
        alpha: { version: 1, hash: alphaBaseHash },
        beta: { version: 1, hash: betaBaseHash },
      })

      writeSkillFiles(projectRoot(), 'alpha', alphaLocal)
      writeSkillFiles(projectRoot(), 'beta', betaLocal)
      writeLockFile(projectRoot(), {
        alpha: { version: 1, hash: alphaBaseHash },
        beta: { version: 1, hash: betaBaseHash },
      })

      const result = runCli(['push', '--skills', 'alpha,beta', '--project', projectDir], env())
      expect(result.exitCode).toBe(0)

      expect(readSkillFile(libraryDir, 'alpha', SKILL_FILE)).toBe(alphaLocal[SKILL_FILE])
      expect(readSkillFile(libraryDir, 'beta', SKILL_FILE)).toBe(betaLocal[SKILL_FILE])

      const libraryLock = readLockFile(libraryDir)
      expect(libraryLock.skills.alpha).toEqual({ version: 2, hash: alphaLocalHash })
      expect(libraryLock.skills.beta).toEqual({ version: 2, hash: betaLocalHash })

      const projectLock = readLockFile(projectRoot())
      expect(projectLock.skills.alpha).toEqual({ version: 2, hash: alphaLocalHash })
      expect(projectLock.skills.beta).toEqual({ version: 2, hash: betaLocalHash })
    })
  })

  describe('multi-file skill lifecycle', () => {
    test('install copies all files from multi-file library skill', () => {
      runInit()
      const files = {
        [SKILL_FILE]: '# Multi Skill\n',
        'scripts/deploy.sh': '#!/bin/bash\necho deploy\n',
        'references/API.md': '# API Ref\n',
      }
      const hash = hashSkill(files)

      writeSkillFiles(libraryDir, 'multi', files)
      writeLockFile(libraryDir, { multi: { version: 1, hash } })

      runCli(['harness', 'enable', '--id', 'opencode', '--project', projectDir], env())
      const result = runCli(['install', 'multi', '--project', projectDir], env())
      expect(result.exitCode).toBe(0)

      expect(readSkillFile(projectRoot(), 'multi', SKILL_FILE)).toBe(files[SKILL_FILE])
      expect(readSkillFile(projectRoot(), 'multi', 'scripts/deploy.sh')).toBe(files['scripts/deploy.sh'])
      expect(readSkillFile(projectRoot(), 'multi', 'references/API.md')).toBe(files['references/API.md'])

      const projectLock = readLockFile(projectRoot())
      expect(projectLock.skills.multi).toEqual({ version: 1, hash })
    })

    test('harness symlinks full directory for directory-based tools', () => {
      runInit()
      const files = {
        [SKILL_FILE]: '# Harness Dir Test\n',
        'extra.md': '# Extra\n',
      }
      const hash = hashSkill(files)

      writeSkillFiles(libraryDir, 'hdir', files)
      writeLockFile(libraryDir, { hdir: { version: 1, hash } })

      runCli(['harness', 'enable', '--id', 'opencode', '--project', projectDir], env())
      const result = runCli(['install', 'hdir', '--project', projectDir], env())
      expect(result.exitCode).toBe(0)

      const harnessDir = join(projectDir, '.opencode', 'skill', 'hdir')
      expect(lstatSync(harnessDir).isSymbolicLink()).toBe(true)
    })

    test('cursor harness gets only SKILL.md (not directory)', () => {
      runInit()
      const files = {
        [SKILL_FILE]: '# Cursor Test\n',
        'extra.md': '# Extra\n',
      }
      const hash = hashSkill(files)

      writeSkillFiles(libraryDir, 'cursor-test', files)
      writeLockFile(libraryDir, { 'cursor-test': { version: 1, hash } })

      runCli(['harness', 'enable', '--id', 'cursor', '--project', projectDir], env())
      const result = runCli(['install', 'cursor-test', '--project', projectDir], env())
      expect(result.exitCode).toBe(0)

      const cursorFile = join(projectDir, '.cursor', 'rules', 'cursor-test.md')
      // Cursor should have the SKILL.md content linked (not the directory)
      expect(existsSync(cursorFile)).toBe(true)
    })

    test('push updates library with multi-file skill changes', () => {
      runInit()
      const baseFiles = {
        [SKILL_FILE]: '# V1\n',
        'extra.md': '# Extra V1\n',
      }
      const updatedFiles = {
        [SKILL_FILE]: '# V2\n',
        'extra.md': '# Extra V2\n',
        'new-file.md': '# New\n',
      }
      const baseHash = hashSkill(baseFiles)
      const updatedHash = hashSkill(updatedFiles)

      writeSkillFiles(libraryDir, 'pushable', baseFiles)
      writeLockFile(libraryDir, { pushable: { version: 1, hash: baseHash } })

      writeSkillFiles(projectRoot(), 'pushable', updatedFiles)
      writeLockFile(projectRoot(), { pushable: { version: 1, hash: baseHash } })

      const result = runCli(['push', 'pushable', '--project', projectDir], env())
      expect(result.exitCode).toBe(0)

      expect(readSkillFile(libraryDir, 'pushable', SKILL_FILE)).toBe(updatedFiles[SKILL_FILE])
      expect(readSkillFile(libraryDir, 'pushable', 'extra.md')).toBe(updatedFiles['extra.md'])
      expect(readSkillFile(libraryDir, 'pushable', 'new-file.md')).toBe(updatedFiles['new-file.md'])

      const libraryLock = readLockFile(libraryDir)
      expect(libraryLock.skills.pushable).toEqual({ version: 2, hash: updatedHash })

      const projectLock = readLockFile(projectRoot())
      expect(projectLock.skills.pushable).toEqual({ version: 2, hash: updatedHash })
    })

    test('pull updates project with multi-file library changes', () => {
      runInit()
      const baseFiles = {
        [SKILL_FILE]: '# V1\n',
        'ref.md': '# Ref V1\n',
      }
      const updatedFiles = {
        [SKILL_FILE]: '# V2\n',
        'ref.md': '# Ref V2\n',
        'added.md': '# Added\n',
      }
      const baseHash = hashSkill(baseFiles)
      const updatedHash = hashSkill(updatedFiles)

      writeSkillFiles(libraryDir, 'pullable', updatedFiles)
      writeLockFile(libraryDir, { pullable: { version: 2, hash: updatedHash } })

      writeSkillFiles(projectRoot(), 'pullable', baseFiles)
      writeLockFile(projectRoot(), { pullable: { version: 1, hash: baseHash } })

      const result = runCli(['pull', 'pullable', '--project', projectDir], env())
      expect(result.exitCode).toBe(0)

      expect(readSkillFile(projectRoot(), 'pullable', SKILL_FILE)).toBe(updatedFiles[SKILL_FILE])
      expect(readSkillFile(projectRoot(), 'pullable', 'ref.md')).toBe(updatedFiles['ref.md'])
      expect(readSkillFile(projectRoot(), 'pullable', 'added.md')).toBe(updatedFiles['added.md'])

      const projectLock = readLockFile(projectRoot())
      expect(projectLock.skills.pullable).toEqual({ version: 2, hash: updatedHash })
    })

    test('status shows ahead when project edits auxiliary file', () => {
      runInit()
      const baseFiles = {
        [SKILL_FILE]: '# Status Test\n',
        'extra.md': '# V1\n',
      }
      const baseHash = hashSkill(baseFiles)

      writeSkillFiles(libraryDir, 'status-test', baseFiles)
      writeLockFile(libraryDir, { 'status-test': { version: 1, hash: baseHash } })

      writeSkillFiles(projectRoot(), 'status-test', baseFiles)
      writeLockFile(projectRoot(), { 'status-test': { version: 1, hash: baseHash } })

      // Edit auxiliary file in project
      const modifiedFiles = { ...baseFiles, 'extra.md': '# V2 modified\n' }
      writeSkillFiles(projectRoot(), 'status-test', modifiedFiles)

      const result = runCli(['status', '--project', projectDir, '--json'], env())
      expect(result.exitCode).toBe(0)

      const output = JSON.parse(result.stdout)
      const skill = output.skills.find((s: { id: string }) => s.id === 'status-test')
      expect(skill).toBeDefined()
      expect(skill.status).toBe('ahead')
    })
  })
})
