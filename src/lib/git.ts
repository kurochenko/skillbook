import { existsSync } from 'fs'
import { join } from 'path'

export type GitResult = {
  success: boolean
  output: string
  error: string
}

export type GitCommitResult =
  | { success: true; commitHash: string }
  | { success: false; error: string }

export const isGitRepo = (dir: string): boolean => {
  return existsSync(join(dir, '.git'))
}

export const runGit = async (dir: string, args: string[]): Promise<GitResult> => {
  try {
    const proc = Bun.spawn(['git', ...args], {
      cwd: dir,
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const exitCode = await proc.exited
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()

    return {
      success: exitCode === 0,
      output: stdout.trim(),
      error: stderr.trim() || (exitCode !== 0 ? `Git command failed with exit code ${exitCode}` : ''),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, output: '', error: message }
  }
}

const ensureGitConfigValue = async (
  dir: string,
  key: string,
  value: string,
): Promise<GitResult> => {
  const result = await runGit(dir, ['config', key])

  if (result.success && result.output) {
    return { success: true, output: result.output, error: '' }
  }

  const setResult = await runGit(dir, ['config', key, value])
  if (!setResult.success) return setResult

  return { success: true, output: value, error: '' }
}

export const gitInit = async (dir: string): Promise<GitResult> => {
  if (isGitRepo(dir)) {
    return { success: true, output: 'Already a git repository', error: '' }
  }

  return runGit(dir, ['init'])
}

export const gitAdd = async (dir: string, filePath: string): Promise<GitResult> => {
  return runGit(dir, ['add', filePath])
}

export const gitCommit = async (dir: string, message: string): Promise<GitCommitResult> => {
  const result = await runGit(dir, ['commit', '-m', message])

  if (!result.success) {
    return { success: false, error: result.error }
  }

  const hashResult = await runGit(dir, ['rev-parse', '--short', 'HEAD'])

  if (!hashResult.success) {
    return { success: true, commitHash: 'unknown' }
  }

  return { success: true, commitHash: hashResult.output ?? 'unknown' }
}

export const ensureGitConfig = async (dir: string): Promise<GitResult> => {
  const nameResult = await ensureGitConfigValue(dir, 'user.name', 'skillbook')
  if (!nameResult.success) return nameResult

  const emailResult = await ensureGitConfigValue(dir, 'user.email', 'skillbook@local')
  if (!emailResult.success) return emailResult

  return { success: true, output: '', error: '' }
}
