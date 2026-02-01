import { checkOriginStatus, gitPullWithStash } from '@/lib/git'

export type OriginPlan =
  | { status: 'skip'; warning?: string }
  | { status: 'push' }
  | { status: 'error'; error: string }

export const resolveOriginPlan = async (libraryPath: string, skillName: string): Promise<OriginPlan> => {
  const originStatus = await checkOriginStatus(libraryPath)

  switch (originStatus.status) {
    case 'no-origin':
      return { status: 'skip' }
    case 'error':
      return { status: 'skip', warning: `Skill committed but failed to check origin: ${originStatus.error}` }
    case 'diverged':
      return {
        status: 'error',
        error: `Library has diverged from origin (${originStatus.ahead} ahead, ${originStatus.behind} behind). Manual merge required in ~/.SB.`,
      }
    case 'behind': {
      const pullResult = await gitPullWithStash(libraryPath, {
        message: `Auto-stash before pulling ${skillName}`,
      })

      if (!pullResult.success) {
        if (pullResult.step === 'stash') {
          return { status: 'error', error: `Failed to stash local changes: ${pullResult.error}` }
        }

        if (pullResult.step === 'pop') {
          return {
            status: 'error',
            error: `Pulled from origin but failed to restore stashed changes: ${pullResult.error}. Run 'git stash pop' in ~/.SB to recover.`,
          }
        }

        return {
          status: 'error',
          error: `Library is behind origin by ${originStatus.commits} commits and cannot fast-forward. Please resolve manually.`,
        }
      }

      return { status: 'push' }
    }
    case 'synced':
    case 'ahead':
      return { status: 'push' }
    default: {
      const _exhaustive: never = originStatus
      return { status: 'error', error: `Unhandled origin status: ${String(_exhaustive)}` }
    }
  }
}
