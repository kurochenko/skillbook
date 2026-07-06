import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createHash } from 'crypto'
import { dirname, join } from 'path'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'

import { SKILL_FILE } from '@/constants'
import { getLockFilePath, getLockSkillsPath, getProjectLockRoot } from '@/lib/paths'
import { verifyProject } from '@/lib/verify'
import { runCli } from '@/test-utils/cli'

type LockEntry = {
  version: number
  hash: string
}

describe('verify command', () => {
  let tempDir: string
  let libraryDir: string
  let projectDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'skillbook-lock-verify-'))
    libraryDir = join(tempDir, '.skillbook')
    projectDir = join(tempDir, 'project')
    mkdirSync(projectDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  const env = () => ({ SKILLBOOK_LIBRARY: libraryDir })
  const projectRoot = () => getProjectLockRoot(projectDir)

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
    harnesses: string[] = [],
    harnessModes: Record<string, 'symlink' | 'copy'> = {},
  ) => {
    mkdirSync(root, { recursive: true })
    writeFileSync(
      getLockFilePath(root),
      JSON.stringify({ schema: 1, skills, harnesses, harnessModes }, null, 2) + '\n',
      'utf-8',
    )
  }

  const setupCleanProject = () => {
    const alpha = { [SKILL_FILE]: '# Alpha\n' }
    writeSkillFiles(projectRoot(), 'alpha', alpha)
    writeLockFile(projectRoot(), {
      alpha: { version: 1, hash: hashSkill(alpha) },
    })
  }

  test('clean project exits 0 with clean message', () => {
    setupCleanProject()

    const result = runCli(['verify', '--project', projectDir], env())

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('verified: 1 skill and 0 harnesses clean')
  })

  test('edited skill content reports hash-mismatch and exits 1', () => {
    setupCleanProject()
    writeFileSync(
      join(getLockSkillsPath(projectRoot()), 'alpha', SKILL_FILE),
      '# Alpha drifted\n',
      'utf-8',
    )

    const result = runCli(['verify', '--project', projectDir], env())

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('hash-mismatch')
    expect(result.output).toContain('alpha')
  })

  test('skill directory present but absent from lockfile reports unlocked-skill', () => {
    setupCleanProject()
    writeSkillFiles(projectRoot(), 'beta', { [SKILL_FILE]: '# Beta\n' })

    const result = runCli(['verify', '--project', projectDir], env())

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('unlocked-skill')
    expect(result.output).toContain('beta')
  })

  test('removed harness symlink reports a harness finding', () => {
    setupCleanProject()
    const lockPath = getLockFilePath(projectRoot())
    writeFileSync(
      lockPath,
      JSON.stringify(
        {
          schema: 1,
          skills: {
            alpha: {
              version: 1,
              hash: hashSkill({ [SKILL_FILE]: '# Alpha\n' }),
            },
          },
          harnesses: ['codex'],
          harnessModes: { codex: 'symlink' },
        },
        null,
        2,
      ) + '\n',
      'utf-8',
    )

    const result = runCli(['verify', '--project', projectDir], env())

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('harness codex harness-missing')
  })

  test('corrupt lockfile exits 1 with friendly message', () => {
    mkdirSync(projectRoot(), { recursive: true })
    writeFileSync(getLockFilePath(projectRoot()), '{ broken json', 'utf-8')

    const result = runCli(['verify', '--project', projectDir], env())

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('lockfile-error')
    expect(result.output).toContain('Invalid lock file')
  })

  test('--json returns machine-readable verification result', () => {
    setupCleanProject()
    writeSkillFiles(projectRoot(), 'beta', { [SKILL_FILE]: '# Beta\n' })

    const result = runCli(['verify', '--project', projectDir, '--json'], env())

    expect(result.exitCode).toBe(1)
    const data = JSON.parse(result.stdout) as {
      ok: boolean
      findings: Array<{ kind: string; skill?: string; harness?: string; detail: string }>
      skills: number
      harnesses: number
    }
    expect(data.ok).toBe(false)
    expect(data.skills).toBe(1)
    expect(data.harnesses).toBe(0)
    expect(data.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'unlocked-skill', skill: 'beta' }),
      ]),
    )
  })

  test('verifyProject returns a unit-testable result', async () => {
    setupCleanProject()

    const result = await verifyProject(projectDir)

    expect(result).toMatchObject({
      ok: true,
      findings: [],
      skills: 1,
      harnesses: 0,
    })
  })
})
