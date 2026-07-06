import { describe, expect, test } from 'bun:test'

import { getInstallableSkillOptions } from '@/commands/install'

describe('install command helpers', () => {
  test('getInstallableSkillOptions returns library skills that are not installed', () => {
    const options = getInstallableSkillOptions(
      ['alpha', 'beta', 'gamma'],
      ['beta'],
      {
        alpha: {
          version: 2,
          hash: 'sha256:alpha',
          updatedAt: '2026-07-06T12:00:00.000Z',
        },
        gamma: {
          version: 1,
          hash: 'sha256:gamma',
        },
      },
    )

    expect(options).toEqual([
      {
        value: 'alpha',
        label: 'alpha',
        hint: 'v2 updated 2026-07-06T12:00:00.000Z',
      },
      {
        value: 'gamma',
        label: 'gamma',
        hint: 'v1',
      },
    ])
  })
})
