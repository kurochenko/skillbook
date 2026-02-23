import { existsSync } from 'fs'
import { defineCommand } from 'citty'
import pc from 'picocolors'

import { copySkillDir } from '@/lib/lock-copy'
import { SUPPORTED_TOOLS, type ToolId } from '@/constants'
import { linkSkillToHarness } from '@/lib/lock-harness'
import {
  getHarnessMode,
  readLockFile,
  setHarnessMode,
  setLockEntry,
  type LockFile,
  writeLockFile,
} from '@/lib/lockfile'
import { computeSkillHash } from '@/lib/skill-hash'
import { getLibraryLockContext, getProjectLockContext } from '@/lib/lock-context'
import { getSkillDir } from '@/lib/skill-fs'
import { resolveSkills } from '@/commands/utils'

const pullSkill = async (
  skill: string,
  projectPath: string,
): Promise<{
  success: boolean
  error?: string
  alreadyUpToDate?: boolean
  exitCode?: number
  conflicts?: number
  drifted?: number
  fallbackHarnesses?: ToolId[]
}> => {
  const projectContext = getProjectLockContext(projectPath)
  const libraryContext = getLibraryLockContext()
  const projectSkillDir = getSkillDir(projectContext.skillsPath, skill)
  const librarySkillDir = getSkillDir(libraryContext.skillsPath, skill)

  if (!existsSync(librarySkillDir)) {
    return { success: false, error: `Skill not found in library: ${skill}`, exitCode: 1 }
  }

  const libraryLock = readLockFile(libraryContext.lockFilePath)
  const projectLock = readLockFile(projectContext.lockFilePath)
  const libraryEntry = libraryLock.skills[skill]
  const projectEntry = projectLock.skills[skill]

  if (!libraryEntry) {
    return { success: false, error: `No lock entry found for skill in library: ${skill}`, exitCode: 1 }
  }

  const syncHarnessesForSkill = (
    lock: LockFile,
  ): { lock: LockFile; conflicts: number; drifted: number; fallbackHarnesses: ToolId[] } => {
    const harnesses = (lock.harnesses ?? []).filter((h): h is ToolId => SUPPORTED_TOOLS.includes(h as ToolId))

    let conflicts = 0
    let drifted = 0
    let nextLock = lock
    const fallbackHarnesses: ToolId[] = []

    for (const harnessId of harnesses) {
      const result = linkSkillToHarness(projectPath, harnessId, skill, {
        mode: getHarnessMode(nextLock, harnessId),
        force: true,
        allowModeFallback: true,
      })

      if (result.conflict) conflicts += 1
      if (result.drifted) drifted += 1

      if (result.fallbackToCopy && getHarnessMode(nextLock, harnessId) !== result.mode) {
        nextLock = setHarnessMode(nextLock, harnessId, result.mode)
        fallbackHarnesses.push(harnessId)
      }
    }

    return { lock: nextLock, conflicts, drifted, fallbackHarnesses }
  }

  if (!existsSync(projectSkillDir)) {
    copySkillDir(librarySkillDir, projectSkillDir)
    const updatedLockEntry = setLockEntry(projectLock, skill, {
      version: libraryEntry.version,
      hash: libraryEntry.hash,
      updatedAt: libraryEntry.updatedAt,
    })

    const harnessSync = syncHarnessesForSkill(updatedLockEntry)
    writeLockFile(projectContext.lockFilePath, harnessSync.lock)

    return {
      success: true,
      conflicts: harnessSync.conflicts,
      drifted: harnessSync.drifted,
      fallbackHarnesses: harnessSync.fallbackHarnesses,
    }
  }

  if (!projectEntry) {
    return {
      success: false,
      error: `Skill '${skill}' is not linked to a lock entry. Run install instead.`,
      exitCode: 2,
    }
  }

  const projectHash = await computeSkillHash(projectSkillDir)
  const projectChanged = projectHash !== projectEntry.hash
  const libraryAdvanced =
    libraryEntry.version !== projectEntry.version || libraryEntry.hash !== projectEntry.hash

  if (projectChanged && libraryAdvanced) {
    return {
      success: false,
      error: `Skill '${skill}' has diverged. Resolve conflicts before pulling.`,
      exitCode: 2,
    }
  }

  if (projectChanged && !libraryAdvanced) {
    return { success: false, error: `Skill '${skill}' has local changes. Push before pulling.`, exitCode: 2 }
  }

  if (!projectChanged && !libraryAdvanced) {
    return { success: true, alreadyUpToDate: true }
  }

  copySkillDir(librarySkillDir, projectSkillDir)
  const updatedLockEntry = setLockEntry(projectLock, skill, {
    version: libraryEntry.version,
    hash: libraryEntry.hash,
    updatedAt: libraryEntry.updatedAt,
  })

  const harnessSync = syncHarnessesForSkill(updatedLockEntry)
  writeLockFile(projectContext.lockFilePath, harnessSync.lock)

  return {
    success: true,
    conflicts: harnessSync.conflicts,
    drifted: harnessSync.drifted,
    fallbackHarnesses: harnessSync.fallbackHarnesses,
  }
}

export default defineCommand({
  meta: {
    name: 'pull',
    description: 'Pull a skill from the lock-based library into a project',
  },
  args: {
    skill: {
      type: 'positional',
      description: 'Skill id',
      required: false,
    },
    skills: {
      type: 'string',
      description: 'Comma-separated list of skill ids',
    },
    project: {
      type: 'string',
      description: 'Project path (defaults to current directory)',
    },
  },
  run: async ({ args }) => {
    const { skill, skills, project } = args
    const projectPath = project ?? process.cwd()

    const resolvedSkills = resolveSkills(skill, skills)
    const results: Array<{
      skill: string
      success: boolean
      error?: string
      alreadyUpToDate?: boolean
      exitCode?: number
      conflicts?: number
      drifted?: number
      fallbackHarnesses?: ToolId[]
    }> = []

    for (const skill of resolvedSkills) {
      const result = await pullSkill(skill, projectPath)
      results.push({ skill, ...result })

      if (result.success) {
        if (result.alreadyUpToDate) {
          process.stdout.write(pc.dim('✔ ') + `Skill '${skill}' is already up to date.\n`)
        } else {
          process.stdout.write(pc.green('✔ ') + `Pulled skill '${pc.bold(skill)}'\n`)

          if (result.conflicts && result.conflicts > 0) {
            process.stdout.write(
              pc.yellow(
                `  ${result.conflicts} harness path${result.conflicts === 1 ? '' : 's'} skipped (conflict).\n`,
              ),
            )
          }

          if (result.drifted && result.drifted > 0) {
            process.stdout.write(
              pc.yellow(
                `  ${result.drifted} drifted harness copy${result.drifted === 1 ? '' : 'ies'} skipped (use 'skillbook harness sync --force').\n`,
              ),
            )
          }

          if (result.fallbackHarnesses && result.fallbackHarnesses.length > 0) {
            process.stdout.write(
              pc.yellow(
                `  Symlink fallback: switched to copy mode for ${result.fallbackHarnesses.join(', ')}.\n`,
              ),
            )
          }
        }
      } else {
        process.stdout.write(pc.red('✗ ') + `${result.error}\n`)
      }
    }

    const successCount = results.filter((r) => r.success).length
    const failCount = results.filter((r) => !r.success).length

    process.stdout.write(
      pc.dim(`${successCount} pulled${failCount > 0 ? `, ${failCount} failed` : ''}`) + '\n',
    )

    if (failCount > 0) {
      const maxExitCode = Math.max(...results.filter(r => !r.success).map(r => r.exitCode ?? 1))
      process.exit(maxExitCode)
    }
  },
})
