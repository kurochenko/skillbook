import { existsSync, statSync } from 'fs'

import { type ToolId } from '@/constants'
import { enabledHarnesses } from '@/lib/harness'
import { getHarnessStatus } from '@/lib/lock-harness'
import { getLibraryLockContext, getProjectLockContext, type LockContext } from '@/lib/lock-context'
import { getHarnessMode, LockFileError, readLockFile, type LockFile } from '@/lib/lockfile'
import { computeSkillHash } from '@/lib/skill-hash'
import { getSkillDir, listSkillIds } from '@/lib/skill-fs'

export type VerifyFindingKind =
  | 'lockfile-error'
  | 'hash-mismatch'
  | 'missing-skill'
  | 'unlocked-skill'
  | 'skill-read-error'
  | 'harness-drifted'
  | 'harness-missing'
  | 'harness-conflict'
  | 'harness-stale'
  | 'library-lockfile-error'
  | 'library-hash-mismatch'
  | 'library-missing-skill'
  | 'library-skill-read-error'

export type VerifyFinding = {
  kind: VerifyFindingKind
  skill?: string
  harness?: string
  detail: string
}

export type VerifyResult = {
  ok: boolean
  findings: VerifyFinding[]
  skills: number
  harnesses: number
}

export type VerifyProjectOptions = {
  library?: boolean
}

const isDirectory = (path: string): boolean => {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

const readLockForVerify = (
  context: LockContext,
  kind: 'lockfile-error' | 'library-lockfile-error',
): { lock: LockFile | null; finding?: VerifyFinding } => {
  try {
    return { lock: readLockFile(context.lockFilePath) }
  } catch (error) {
    const message = error instanceof LockFileError || error instanceof Error
      ? error.message
      : String(error)
    return {
      lock: null,
      finding: {
        kind,
        detail: message,
      },
    }
  }
}

const verifyLockEntries = async (
  lock: LockFile,
  context: LockContext,
  findings: VerifyFinding[],
  opts: {
    missingKind: 'missing-skill' | 'library-missing-skill'
    mismatchKind: 'hash-mismatch' | 'library-hash-mismatch'
    readErrorKind: 'skill-read-error' | 'library-skill-read-error'
    unlocked?: boolean
  },
) => {
  const lockedSkillIds = Object.keys(lock.skills).sort()

  for (const skillId of lockedSkillIds) {
    const skillDir = getSkillDir(context.skillsPath, skillId)
    if (!existsSync(skillDir) || !isDirectory(skillDir)) {
      findings.push({
        kind: opts.missingKind,
        skill: skillId,
        detail: `Locked skill '${skillId}' is missing from ${context.skillsPath}.`,
      })
      continue
    }

    try {
      const actualHash = await computeSkillHash(skillDir)
      const expectedHash = lock.skills[skillId]?.hash
      if (actualHash !== expectedHash) {
        findings.push({
          kind: opts.mismatchKind,
          skill: skillId,
          detail: `Locked hash ${expectedHash} does not match current hash ${actualHash}.`,
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      findings.push({
        kind: opts.readErrorKind,
        skill: skillId,
        detail: `Could not read skill '${skillId}': ${message}`,
      })
    }
  }

  if (!opts.unlocked) return

  const locked = new Set(lockedSkillIds)
  for (const skillId of listSkillIds(context.skillsPath)) {
    if (locked.has(skillId)) continue
    findings.push({
      kind: 'unlocked-skill',
      skill: skillId,
      detail: `Skill '${skillId}' exists in ${context.skillsPath} but is not in the lockfile.`,
    })
  }
}

export const verifyProject = async (
  projectPath: string,
  opts: VerifyProjectOptions = {},
): Promise<VerifyResult> => {
  const projectContext = getProjectLockContext(projectPath)
  const findings: VerifyFinding[] = []

  const projectRead = readLockForVerify(projectContext, 'lockfile-error')
  if (projectRead.finding) {
    findings.push(projectRead.finding)
    return {
      ok: false,
      findings,
      skills: 0,
      harnesses: 0,
    }
  }

  const projectLock = projectRead.lock
  if (!projectLock) {
    return { ok: false, findings, skills: 0, harnesses: 0 }
  }

  await verifyLockEntries(projectLock, projectContext, findings, {
    missingKind: 'missing-skill',
    mismatchKind: 'hash-mismatch',
    readErrorKind: 'skill-read-error',
    unlocked: true,
  })

  const harnesses = enabledHarnesses(projectLock.harnesses)
  for (const harnessId of harnesses) {
    const status = getHarnessStatus(projectPath, harnessId, getHarnessMode(projectLock, harnessId))

    if (status.drifted > 0) {
      findings.push({
        kind: 'harness-drifted',
        harness: harnessId,
        detail: `${status.drifted} harness entr${status.drifted === 1 ? 'y has' : 'ies have'} drifted from project skills.`,
      })
    }

    if (status.missing > 0) {
      findings.push({
        kind: 'harness-missing',
        harness: harnessId,
        detail: `${status.missing} project skill${status.missing === 1 ? ' is' : 's are'} missing from the harness.`,
      })
    }

    if (status.conflicts > 0) {
      findings.push({
        kind: 'harness-conflict',
        harness: harnessId,
        detail: `${status.conflicts} harness path${status.conflicts === 1 ? ' conflicts' : 's conflict'} with expected skill entries.`,
      })
    }

    if (status.stale > 0) {
      findings.push({
        kind: 'harness-stale',
        harness: harnessId,
        detail: `${status.stale} stale harness entr${status.stale === 1 ? 'y points' : 'ies point'} at removed project skills.`,
      })
    }
  }

  if (opts.library) {
    const libraryContext = getLibraryLockContext()
    const libraryRead = readLockForVerify(libraryContext, 'library-lockfile-error')
    if (libraryRead.finding) {
      findings.push(libraryRead.finding)
    } else if (libraryRead.lock) {
      await verifyLockEntries(libraryRead.lock, libraryContext, findings, {
        missingKind: 'library-missing-skill',
        mismatchKind: 'library-hash-mismatch',
        readErrorKind: 'library-skill-read-error',
      })
    }
  }

  return {
    ok: findings.length === 0,
    findings,
    skills: Object.keys(projectLock.skills).length,
    harnesses: harnesses.length,
  }
}
