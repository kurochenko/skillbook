import { getLockFilePath, getLockLibraryPath, getLockSkillsPath, getProjectLockRoot } from '@/lib/lock-paths'

export type LockContext = {
  root: string
  skillsPath: string
  lockFilePath: string
}

export const getProjectLockContext = (projectPath: string): LockContext => {
  const root = getProjectLockRoot(projectPath)
  return {
    root,
    skillsPath: getLockSkillsPath(root),
    lockFilePath: getLockFilePath(root),
  }
}

export const getLibraryLockContext = (): LockContext => {
  const root = getLockLibraryPath()
  return {
    root,
    skillsPath: getLockSkillsPath(root),
    lockFilePath: getLockFilePath(root),
  }
}
