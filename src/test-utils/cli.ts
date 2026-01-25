import { spawnSync } from 'child_process'
import { join } from 'path'

const CLI_PATH = join(import.meta.dir, '../cli.ts')

export type CliResult = {
  stdout: string
  stderr: string
  exitCode: number
  output: string
}

export const runCli = (args: string[], env: Record<string, string> = {}): CliResult => {
  const result = spawnSync('bun', ['run', CLI_PATH, ...args], {
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  })

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.status ?? 1,
    output: result.stdout + result.stderr,
  }
}
