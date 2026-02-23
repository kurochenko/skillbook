import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { getHarnessMode, readLockFile, setHarnessMode } from '@/lib/lockfile'

describe('lockfile harness modes', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'skillbook-lockfile-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  test('defaults missing harnessModes to symlink mode', () => {
    const lockPath = join(tempDir, 'skillbook.lock.json')
    writeFileSync(lockPath, JSON.stringify({ schema: 1, skills: {}, harnesses: ['opencode'] }) + '\n', 'utf-8')

    const lock = readLockFile(lockPath)
    expect(lock.harnessModes).toEqual({})
    expect(getHarnessMode(lock, 'opencode')).toBe('symlink')
  })

  test('setHarnessMode writes explicit harness mode', () => {
    const updated = setHarnessMode({ schema: 1, skills: {}, harnesses: [] }, 'cursor', 'copy')
    expect(updated.harnessModes).toEqual({ cursor: 'copy' })
    expect(getHarnessMode(updated, 'cursor')).toBe('copy')
  })
})
