import { describe, expect, test } from 'bun:test'
import { shouldShowUpdateBanner } from '@/cli'

describe('shouldShowUpdateBanner', () => {
  test('allows normal interactive release commands', () => {
    expect(shouldShowUpdateBanner(['status'], {}, true, '1.0.0')).toBe(true)
  })

  test('skips local dev builds', () => {
    expect(shouldShowUpdateBanner(['status'], {}, true, 'dev')).toBe(false)
  })

  test('skips non-interactive output', () => {
    expect(shouldShowUpdateBanner(['status'], {}, false, '1.0.0')).toBe(false)
    expect(shouldShowUpdateBanner(['status'], {}, undefined, '1.0.0')).toBe(false)
  })

  test('skips CI', () => {
    expect(shouldShowUpdateBanner(['status'], { CI: 'true' }, true, '1.0.0')).toBe(false)
  })

  test('skips json output anywhere in args', () => {
    expect(shouldShowUpdateBanner(['status', '--json'], {}, true, '1.0.0')).toBe(false)
    expect(shouldShowUpdateBanner(['--json', 'status'], {}, true, '1.0.0')).toBe(false)
  })

  test('skips upgrade and version invocations', () => {
    expect(shouldShowUpdateBanner(['upgrade'], {}, true, '1.0.0')).toBe(false)
    expect(shouldShowUpdateBanner(['--version'], {}, true, '1.0.0')).toBe(false)
    expect(shouldShowUpdateBanner(['-v'], {}, true, '1.0.0')).toBe(false)
  })
})
