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

export const gitPush = async (dir: string, remote: string = 'origin', branch?: string): Promise<GitResult> => {
  const args = branch ? ['push', remote, branch] : ['push', remote]
  return runGit(dir, args)
}

export const gitPull = async (dir: string, ffOnly: boolean = true): Promise<GitResult> => {
  const args = ffOnly ? ['pull', '--ff-only'] : ['pull']
  return runGit(dir, args)
}

export const gitStashPush = async (dir: string, message?: string): Promise<GitResult> => {
  const args = message ? ['stash', 'push', '-m', message] : ['stash', 'push']
  return runGit(dir, args)
}

export const gitStashPop = async (dir: string): Promise<GitResult> => {
  return runGit(dir, ['stash', 'pop'])
}

export type PullWithStashResult =
  | { success: true; stashed: boolean }
  | { success: false; stashed: boolean; step: 'stash' | 'pull' | 'pop'; error: string }

export type PullWithStashOptions = {
  message: string
  ffOnly?: boolean
  shouldStash?: boolean
}

export const gitPullWithStash = async (
  dir: string,
  { message, ffOnly = true, shouldStash = true }: PullWithStashOptions,
): Promise<PullWithStashResult> => {
  let stashed = false

  if (shouldStash) {
    const stashResult = await gitStashPush(dir, message)
    if (!stashResult.success) {
      return { success: false, stashed: false, step: 'stash', error: stashResult.error }
    }

    stashed = !stashResult.output.includes('No local changes to save')
  }

  const pullResult = await gitPull(dir, ffOnly)
  if (!pullResult.success) {
    if (stashed) {
      await gitStashPop(dir)
    }
    return { success: false, stashed, step: 'pull', error: pullResult.error }
  }

  if (stashed) {
    const popResult = await gitStashPop(dir)
    if (!popResult.success) {
      return { success: false, stashed, step: 'pop', error: popResult.error }
    }
  }

  return { success: true, stashed }
}

export const gitFetch = async (dir: string, remote: string = 'origin'): Promise<GitResult> => {
  return runGit(dir, ['fetch', remote])
}

export const getRemoteUrl = async (dir: string, remote: string = 'origin'): Promise<string | null> => {
  const result = await runGit(dir, ['remote', 'get-url', remote])
  if (result.success && result.output) {
    return result.output.trim()
  }
  return null
}

export const getCurrentBranch = async (dir: string): Promise<string | null> => {
  const upstreamResult = await runGit(dir, ['rev-parse', '--abbrev-ref', '@{u}'])
  if (upstreamResult.success && upstreamResult.output) {
    const parts = upstreamResult.output.split('/')
    if (parts.length >= 2) {
      return parts.slice(1).join('/')
    }
  }

  const branchResult = await runGit(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])
  if (branchResult.success && branchResult.output && branchResult.output !== 'HEAD') {
    return branchResult.output
  }

  const originHead = await runGit(dir, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
  if (!originHead.success || !originHead.output) return null

  return originHead.output.replace('origin/', '').trim()
}

export type OriginStatus =
  | { status: 'synced' }
  | { status: 'ahead'; commits: number }
  | { status: 'behind'; commits: number }
  | { status: 'diverged'; ahead: number; behind: number }
  | { status: 'no-origin' }
  | { status: 'error'; error: string }

export const checkOriginStatus = async (dir: string): Promise<OriginStatus> => {
  const remoteResult = await runGit(dir, ['remote', 'get-url', 'origin'])
  if (!remoteResult.success || !remoteResult.output) {
    return { status: 'no-origin' }
  }

  const fetchResult = await gitFetch(dir)
  if (!fetchResult.success) {
    return { status: 'error', error: fetchResult.error }
  }

  const branch = await getCurrentBranch(dir)
  if (!branch) {
    return { status: 'error', error: 'Failed to determine current branch' }
  }

  const behindResult = await runGit(dir, ['rev-list', '--count', `HEAD..origin/${branch}`])
  if (!behindResult.success) {
    return { status: 'error', error: behindResult.error }
  }
  const behind = parseInt(behindResult.output, 10) || 0

  const aheadResult = await runGit(dir, ['rev-list', '--count', `origin/${branch}..HEAD`])
  if (!aheadResult.success) {
    return { status: 'error', error: aheadResult.error }
  }
  const ahead = parseInt(aheadResult.output, 10) || 0

  if (ahead === 0 && behind === 0) {
    return { status: 'synced' }
  }

  if (ahead > 0 && behind === 0) {
    return { status: 'ahead', commits: ahead }
  }

  if (ahead === 0 && behind > 0) {
    return { status: 'behind', commits: behind }
  }

  return { status: 'diverged', ahead, behind }
}
