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

  test('Whitespace in positional arg is trimmed', () => {
    const result = resolveSkills(' alpha ', undefined)
    expect(result).toEqual(['alpha'])
  })

  test('Rejects traversal skill ids', () => {
    const stderrOutput: string[] = []
    process.stderr.write = (chunk: string) => {
      stderrOutput.push(chunk)
      return true
    }
    process.exit = ((code?: number | string) => {
      throw new Error(`exit:${code}`)
    }) as (code?: number | string) => never

    expect(() => resolveSkills('../../x', undefined)).toThrow('exit:1')
    expect(stderrOutput.join()).toContain('Invalid skill name "../../x"')
    expect(stderrOutput.join()).toContain(
      'Skill name can only contain lowercase letters, numbers, hyphens, and underscores',
    )
  })

  test('Rejects blank positional skill ids', () => {
    const stderrOutput: string[] = []
    process.stderr.write = (chunk: string) => {
      stderrOutput.push(chunk)
      return true
    }
    process.exit = ((code?: number | string) => {
      throw new Error(`exit:${code}`)
    }) as (code?: number | string) => never

    expect(() => resolveSkills(' ', undefined)).toThrow('exit:1')
    expect(stderrOutput.join()).toContain('No skills specified')
  })

  test('Rejects uppercase skill ids', () => {
    const stderrOutput: string[] = []
    process.stderr.write = (chunk: string) => {
      stderrOutput.push(chunk)
      return true
    }
    process.exit = ((code?: number | string) => {
      throw new Error(`exit:${code}`)
    }) as (code?: number | string) => never

    expect(() => resolveSkills(undefined, 'alpha,Beta')).toThrow('exit:1')
    expect(stderrOutput.join()).toContain('Invalid skill name "Beta"')
    expect(stderrOutput.join()).toContain('Skill name cannot contain uppercase letters')
  })

  test('Valid skill ids pass validation', () => {
    const result = resolveSkills('alpha-1', 'beta_2,gamma')
    expect(result).toEqual(['alpha-1', 'beta_2', 'gamma'])
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
