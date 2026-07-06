import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import * as realFs from 'fs'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { dirname, join, relative } from 'path'

import { SKILL_FILE } from '@/constants'
import { getHarnessMode, type LockFile } from '@/lib/lockfile'
import { getLockSkillsPath, getProjectLockRoot } from '@/lib/paths'

let rejectSymlinks = false
const originalSymlinkSync = realFs.symlinkSync

mock.module('fs', () => ({
  ...realFs,
  symlinkSync: (...args: Parameters<typeof realFs.symlinkSync>) => {
    if (rejectSymlinks) {
      const error = new Error('symlinks are unsupported') as Error & { code?: string }
      error.code = 'EPERM'
      throw error
    }

    return originalSymlinkSync(...args)
  },
}))

const { syncSkillToHarnesses } = await import('@/lib/lock-operations')

describe('lock operations', () => {
  let tempDir: string
  let projectDir: string

  beforeEach(() => {
    rejectSymlinks = false
    tempDir = realFs.mkdtempSync(join(tmpdir(), 'skillbook-lock-operations-'))
    projectDir = join(tempDir, 'project')
    mkdirSync(projectDir, { recursive: true })
  })

  afterEach(() => {
    rejectSymlinks = false
    rmSync(tempDir, { recursive: true, force: true })
  })

  const writeProjectSkill = (id: string, content = '# Alpha\n') => {
    const skillDir = join(getLockSkillsPath(getProjectLockRoot(projectDir)), id)
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(join(skillDir, SKILL_FILE), content, 'utf-8')
    return skillDir
  }

  const lock = (
    harnesses: string[],
    harnessModes?: Record<string, 'symlink' | 'copy'>,
  ): LockFile => ({
    schema: 1,
    skills: {
      alpha: {
        version: 1,
        hash: 'sha256:alpha',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    },
    harnesses,
    harnessModes,
  })

  test('syncSkillToHarnesses links enabled harnesses with symlinks', () => {
    const skillDir = writeProjectSkill('alpha')

    const result = syncSkillToHarnesses(projectDir, 'alpha', lock(['opencode']))

    expect(result.conflicts).toBe(0)
    expect(result.drifted).toBe(0)
    expect(result.fallbackHarnesses).toEqual([])

    const harnessDir = join(projectDir, '.opencode', 'skill', 'alpha')
    expect(lstatSync(harnessDir).isSymbolicLink()).toBe(true)
    expect(readlinkSync(harnessDir)).toBe(relative(dirname(harnessDir), skillDir))
  })

  test('syncSkillToHarnesses counts copy-mode conflicts', () => {
    writeProjectSkill('alpha')
    const conflictPath = join(projectDir, '.opencode', 'skill', 'alpha')
    mkdirSync(dirname(conflictPath), { recursive: true })
    writeFileSync(conflictPath, 'not a directory\n', 'utf-8')

    const result = syncSkillToHarnesses(projectDir, 'alpha', lock(['opencode'], { opencode: 'copy' }))

    expect(result.conflicts).toBe(1)
    expect(result.drifted).toBe(0)
    expect(result.fallbackHarnesses).toEqual([])
    expect(readFileSync(conflictPath, 'utf-8')).toBe('not a directory\n')
  })

  test('syncSkillToHarnesses persists fallback-to-copy mode in returned lock', () => {
    writeProjectSkill('alpha')
    rejectSymlinks = true

    const result = syncSkillToHarnesses(projectDir, 'alpha', lock(['cursor']))

    expect(result.conflicts).toBe(0)
    expect(result.drifted).toBe(0)
    expect(result.fallbackHarnesses).toEqual(['cursor'])
    expect(getHarnessMode(result.lock, 'cursor')).toBe('copy')

    const cursorDir = join(projectDir, '.cursor', 'skills', 'alpha')
    expect(existsSync(cursorDir)).toBe(true)
    expect(lstatSync(cursorDir).isSymbolicLink()).toBe(false)
    expect(readFileSync(join(cursorDir, SKILL_FILE), 'utf-8')).toBe('# Alpha\n')
  })
})
