import { describe, expect, test } from 'bun:test'

import { resolveLockStatus, type LockStatusInput } from '@/lib/lock-status'

describe('resolveLockStatus', () => {
  const entry = (version: number, hash: string) => ({ version, hash })

  const cases: Array<{
    name: string
    input: LockStatusInput
    expected: ReturnType<typeof resolveLockStatus>
  }> = [
    {
      name: 'synced when project content and lock entries match',
      input: {
        projectHash: 'hash-a',
        projectEntry: entry(1, 'hash-a'),
        libraryEntry: entry(1, 'hash-a'),
      },
      expected: 'synced',
    },
    {
      name: 'ahead when project content changed and library stayed at base',
      input: {
        projectHash: 'hash-local',
        projectEntry: entry(1, 'hash-a'),
        libraryEntry: entry(1, 'hash-a'),
      },
      expected: 'ahead',
    },
    {
      name: 'behind when library version is newer and project content is clean',
      input: {
        projectHash: 'hash-a',
        projectEntry: entry(1, 'hash-a'),
        libraryEntry: entry(2, 'hash-b'),
      },
      expected: 'behind',
    },
    {
      name: 'diverged when project changed and library version advanced',
      input: {
        projectHash: 'hash-local',
        projectEntry: entry(1, 'hash-a'),
        libraryEntry: entry(2, 'hash-b'),
      },
      expected: 'diverged',
    },
    {
      name: 'diverged when same version has different library hash and project is clean',
      input: {
        projectHash: 'hash-a',
        projectEntry: entry(1, 'hash-a'),
        libraryEntry: entry(1, 'hash-b'),
      },
      expected: 'diverged',
    },
    {
      name: 'diverged when older library version has different hash',
      input: {
        projectHash: 'hash-a',
        projectEntry: entry(2, 'hash-a'),
        libraryEntry: entry(1, 'hash-b'),
      },
      expected: 'diverged',
    },
    {
      name: 'local-only when project content has no project lock entry',
      input: {
        projectHash: 'hash-a',
        projectEntry: null,
        libraryEntry: null,
      },
      expected: 'local-only',
    },
    {
      name: 'library-only when library has an entry and project content is absent',
      input: {
        projectHash: null,
        projectEntry: null,
        libraryEntry: entry(1, 'hash-a'),
      },
      expected: 'library-only',
    },
  ]

  for (const testCase of cases) {
    test(testCase.name, () => {
      expect(resolveLockStatus(testCase.input)).toBe(testCase.expected)
    })
  }
})
