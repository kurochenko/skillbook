import { type LockEntry } from '@/lib/lockfile'

export type LockStatus =
  | 'synced'
  | 'ahead'
  | 'behind'
  | 'diverged'
  | 'local-only'
  | 'library-only'

export type LockStatusInput = {
  projectHash: string | null
  projectEntry: LockEntry | null
  libraryEntry: LockEntry | null
}

export const resolveLockStatus = (input: LockStatusInput): LockStatus => {
  const { projectHash, projectEntry, libraryEntry } = input

  if (!projectHash) {
    return libraryEntry ? 'library-only' : 'local-only'
  }

  if (!projectEntry) {
    return 'local-only'
  }

  if (!libraryEntry) {
    return 'local-only'
  }

  const projectChanged = projectHash !== projectEntry.hash
  const libraryAdvanced =
    libraryEntry.version !== projectEntry.version || libraryEntry.hash !== projectEntry.hash

  if (projectChanged && libraryAdvanced) return 'diverged'
  if (projectChanged) return 'ahead'
  if (libraryAdvanced) return 'behind'
  return 'synced'
}
