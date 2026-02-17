import { describe, expect, test, beforeEach } from 'bun:test'
import { resolveSkills } from '@/commands/utils'

describe('resolveSkills', () => {
  const originalStderrWrite = process.stderr.write
  const originalProcessExit = process.exit

  beforeEach(() => {
    process.stderr.write = originalStderrWrite
    process.exit = originalProcessExit
  })

  test('Single skill from positional arg', () => {
    const result = resolveSkills('alpha', undefined)
    expect(result).toEqual(['alpha'])
  })

  test('Multiple skills from --skills flag', () => {
    const result = resolveSkills(undefined, 'alpha,beta,gamma')
    expect(result).toEqual(['alpha', 'beta', 'gamma'])
  })

  test('Single skill from --skills flag', () => {
    const result = resolveSkills(undefined, 'alpha')
    expect(result).toEqual(['alpha'])
  })

  test('Both positional and --skills merged', () => {
    const result = resolveSkills('alpha', 'beta,gamma')
    expect(result).toEqual(['alpha', 'beta', 'gamma'])
  })

  test('Deduplicates skills', () => {
    const result = resolveSkills('alpha', 'alpha,beta')
    expect(result).toEqual(['alpha', 'beta'])
  })

  test('Deduplicates with warning: both positional and --skills have same skill', () => {
    const stderrOutput: string[] = []
    process.stderr.write = (chunk: string) => {
      stderrOutput.push(chunk)
      return true
    }

    const result = resolveSkills('alpha', 'beta,alpha')

    expect(result).toEqual(['alpha', 'beta'])
    expect(stderrOutput.join()).toContain('duplicate skill name ignored')
  })

  test('No warning on unique skills', () => {
    const stderrOutput: string[] = []
    process.stderr.write = (chunk: string) => {
      stderrOutput.push(chunk)
      return true
    }

    const result = resolveSkills('alpha', 'beta,gamma')

    expect(result).toEqual(['alpha', 'beta', 'gamma'])
    expect(stderrOutput.join()).not.toContain('duplicate')
  })

  test('Empty --skills is ignored', () => {
    const result = resolveSkills('alpha', '')
    expect(result).toEqual(['alpha'])
  })

  test('Whitespace in --skills is trimmed', () => {
    const result = resolveSkills(undefined, ' alpha , beta ,gamma ')
    expect(result).toEqual(['alpha', 'beta', 'gamma'])
  })

  test('Exits with error when no skills specified', () => {
    let exitCode: number | undefined
    process.exit = ((code: number | string) => {
      exitCode = typeof code === 'string' ? parseInt(code, 10) : code
    }) as (code?: number | string) => never
    const stderrOutput: string[] = []
    process.stderr.write = (chunk: string) => {
      stderrOutput.push(chunk)
      return true
    }

    resolveSkills(undefined, undefined)

    expect(exitCode).toBe(1)
    expect(stderrOutput.join()).toContain('No skills specified')
  })

  test('Empty string from both args exits with error', () => {
    let exitCode: number | undefined
    process.exit = ((code: number | string) => {
      exitCode = typeof code === 'string' ? parseInt(code, 10) : code
    }) as (code?: number | string) => never
    const stderrOutput: string[] = []
    process.stderr.write = (chunk: string) => {
      stderrOutput.push(chunk)
      return true
    }

    resolveSkills('', '')

    expect(exitCode).toBe(1)
    expect(stderrOutput.join()).toContain('No skills specified')
  })
})
