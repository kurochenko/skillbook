import { describe, expect, test, beforeEach } from 'bun:test'
import { getAllSkillArgs } from '@/commands/utils'

describe('getAllSkillArgs', () => {
  const originalArgv = process.argv

  beforeEach(() => {
    process.argv = originalArgv
  })

  test('Basic: single skill returns [skill]', () => {
    process.argv = ['node', 'cli', 'install', 'alpha']
    const result = getAllSkillArgs('install', 'alpha')
    expect(result).toEqual(['alpha'])
  })

  test('Multiple skills: returns all', () => {
    process.argv = ['node', 'cli', 'install', 'alpha', 'beta', 'gamma']
    const result = getAllSkillArgs('install', 'alpha')
    expect(result).toEqual(['alpha', 'beta', 'gamma'])
  })

  test('Deduplicates: install alpha alpha → [alpha]', () => {
    process.argv = ['node', 'cli', 'install', 'alpha', 'alpha']
    const result = getAllSkillArgs('install', 'alpha')
    expect(result).toEqual(['alpha'])
  })

  test('Deduplicates with warning: install alpha beta alpha', () => {
    const originalStderrWrite = process.stderr.write
    const stderrOutput: string[] = []
    process.stderr.write = (chunk: string) => {
      stderrOutput.push(chunk)
      return true
    }

    process.argv = ['node', 'cli', 'install', 'alpha', 'beta', 'alpha']
    const result = getAllSkillArgs('install', 'alpha')

    process.stderr.write = originalStderrWrite

    expect(result).toEqual(['alpha', 'beta'])
    expect(stderrOutput.join()).toContain('duplicate skill name ignored')
  })

  test('No warning on normal single skill', () => {
    const originalStderrWrite = process.stderr.write
    const stderrOutput: string[] = []
    process.stderr.write = (chunk: string) => {
      stderrOutput.push(chunk)
      return true
    }

    process.argv = ['node', 'cli', 'install', 'alpha']
    const result = getAllSkillArgs('install', 'alpha')

    process.stderr.write = originalStderrWrite

    expect(result).toEqual(['alpha'])
    expect(stderrOutput.join()).not.toContain('duplicate skill name ignored')
  })

  test('No warning on normal multi skill', () => {
    const originalStderrWrite = process.stderr.write
    const stderrOutput: string[] = []
    process.stderr.write = (chunk: string) => {
      stderrOutput.push(chunk)
      return true
    }

    process.argv = ['node', 'cli', 'install', 'alpha', 'beta']
    const result = getAllSkillArgs('install', 'alpha')

    process.stderr.write = originalStderrWrite

    expect(result).toEqual(['alpha', 'beta'])
    expect(stderrOutput.join()).not.toContain('duplicate skill name ignored')
  })

  test('Deduplicates non-first args', () => {
    const originalStderrWrite = process.stderr.write
    const stderrOutput: string[] = []
    process.stderr.write = (chunk: string) => {
      stderrOutput.push(chunk)
      return true
    }

    process.argv = ['node', 'cli', 'install', 'alpha', 'beta', 'beta']
    const result = getAllSkillArgs('install', 'alpha')
    process.stderr.write = originalStderrWrite
    expect(result).toEqual(['alpha', 'beta'])
    expect(stderrOutput.join()).toContain('duplicate skill name ignored: beta')
  })

  test('Handles --project value: skips flag and its value', () => {
    process.argv = ['node', 'cli', 'install', 'alpha', '--project', '/foo', 'beta']
    const result = getAllSkillArgs('install', 'alpha')
    expect(result).toEqual(['alpha', 'beta'])
  })

  test('Handles --project=value: skips it', () => {
    process.argv = ['node', 'cli', 'install', 'alpha', '--project=/foo', 'beta']
    const result = getAllSkillArgs('install', 'alpha')
    expect(result).toEqual(['alpha', 'beta'])
  })

  test('Unknown flags ignored: --unknown is not treated as skill', () => {
    process.argv = ['node', 'cli', 'install', 'alpha', '--unknown', 'beta']
    const result = getAllSkillArgs('install', 'alpha')
    expect(result).toEqual(['alpha', 'beta'])
  })

  test('Empty firstSkill returns []', () => {
    process.argv = ['node', 'cli', 'install', 'alpha', 'beta']
    const result = getAllSkillArgs('install', '')
    expect(result).toEqual([])
  })

  test('Handles --help and --version flags', () => {
    process.argv = ['node', 'cli', 'install', 'alpha', '--help', 'beta']
    const result = getAllSkillArgs('install', 'alpha')
    expect(result).toEqual(['alpha', 'beta'])
  })

  test('Handles -h and -v short flags', () => {
    process.argv = ['node', 'cli', 'install', 'alpha', '-h', 'beta']
    const result = getAllSkillArgs('install', 'alpha')
    expect(result).toEqual(['alpha', 'beta'])
  })

  test('Handles --json flag', () => {
    process.argv = ['node', 'cli', 'install', 'alpha', '--json', 'beta']
    const result = getAllSkillArgs('install', 'alpha')
    expect(result).toEqual(['alpha', 'beta'])
  })
})
