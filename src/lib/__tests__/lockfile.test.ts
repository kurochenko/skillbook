import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import {
  getHarnessMode,
  LockFileError,
  readLockFile,
  setHarnessMode,
  writeLockFile,
} from '@/lib/lockfile'

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

  test('corrupt JSON throws LockFileError with path in message', () => {
    const lockPath = join(tempDir, 'skillbook.lock.json')
    writeFileSync(lockPath, '{ nope', 'utf-8')

    expect(() => readLockFile(lockPath)).toThrow(LockFileError)
    expect(() => readLockFile(lockPath)).toThrow(`Invalid lock file at ${lockPath}:`)
    expect(() => readLockFile(lockPath)).toThrow("Fix or delete the file and re-run 'skillbook migrate'.")
  })

  test('entry missing hash throws', () => {
    const lockPath = join(tempDir, 'skillbook.lock.json')
    writeFileSync(lockPath, JSON.stringify({ schema: 1, skills: { alpha: { version: 1 } } }), 'utf-8')

    expect(() => readLockFile(lockPath)).toThrow(LockFileError)
    expect(() => readLockFile(lockPath)).toThrow('skill "alpha" hash must be a non-empty string')
  })

  test.each([
    ['zero', 0],
    ['negative', -1],
    ['non-number', '1'],
  ])('entry with %s version throws', (_label, version) => {
    const lockPath = join(tempDir, 'skillbook.lock.json')
    writeFileSync(
      lockPath,
      JSON.stringify({ schema: 1, skills: { alpha: { version, hash: 'sha256:abc' } } }),
      'utf-8',
    )

    expect(() => readLockFile(lockPath)).toThrow(LockFileError)
    expect(() => readLockFile(lockPath)).toThrow('skill "alpha" version must be an integer >= 1')
  })

  test('traversal skill id throws', () => {
    const lockPath = join(tempDir, 'skillbook.lock.json')
    writeFileSync(
      lockPath,
      JSON.stringify({ schema: 1, skills: { '../../x': { version: 1, hash: 'sha256:abc' } } }),
      'utf-8',
    )

    expect(() => readLockFile(lockPath)).toThrow(LockFileError)
    expect(() => readLockFile(lockPath)).toThrow('invalid skill id "../../x"')
  })

  test('valid file round-trips', () => {
    const lockPath = join(tempDir, 'skillbook.lock.json')
    writeLockFile(lockPath, {
      schema: 1,
      skills: {
        alpha: { version: 2, hash: 'sha256:abc', updatedAt: '2026-07-06T12:00:00.000Z' },
      },
      harnesses: ['opencode'],
      harnessModes: { opencode: 'copy' },
    })

    expect(readLockFile(lockPath)).toEqual({
      schema: 1,
      skills: {
        alpha: { version: 2, hash: 'sha256:abc', updatedAt: '2026-07-06T12:00:00.000Z' },
      },
      harnesses: ['opencode'],
      harnessModes: { opencode: 'copy' },
    })
  })

  test('atomic write leaves no temp files behind', () => {
    const lockPath = join(tempDir, 'skillbook.lock.json')

    writeLockFile(lockPath, {
      schema: 1,
      skills: {
        alpha: { version: 1, hash: 'sha256:abc' },
      },
    })

    expect(readdirSync(tempDir).filter((file) => file.startsWith('skillbook.lock.json.tmp.'))).toEqual([])
  })
})
