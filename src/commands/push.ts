import { existsSync } from 'fs'
import { defineCommand } from 'citty'
import pc from 'picocolors'

import { copySkillDir } from '@/lib/lock-copy'
import { readLockFile, setLockEntry, writeLockFile } from '@/lib/lockfile'
import { computeSkillHash } from '@/lib/skill-hash'
import { getLibraryLockContext, getProjectLockContext } from '@/lib/lock-context'
import { getSkillDir } from '@/lib/skill-fs'
import { getAllSkillArgs } from '@/commands/utils'

const pushSkill = async (
  skill: string,
  projectPath: string,
): Promise<{ success: boolean; error?: string; alreadyUpToDate?: boolean; exitCode?: number }> => {
  const projectContext = getProjectLockContext(projectPath)
  const projectSkillDir = getSkillDir(projectContext.skillsPath, skill)

  if (!existsSync(projectSkillDir)) {
    return { success: false, error: `Skill not found in project: ${skill}` }
  }

  const libraryContext = getLibraryLockContext()
  const librarySkillDir = getSkillDir(libraryContext.skillsPath, skill)

  const libraryLock = readLockFile(libraryContext.lockFilePath)
  const projectLock = readLockFile(projectContext.lockFilePath)
  const projectEntry = projectLock.skills[skill]
  const libraryEntry = libraryLock.skills[skill]

  const projectHash = await computeSkillHash(projectSkillDir)

  if (!projectEntry && libraryEntry) {
    return {
      success: false,
      error: `Skill '${skill}' exists in library but has no project lock entry. Install first.`,
      exitCode: 2,
    }
  }

  const projectChanged = projectEntry ? projectHash !== projectEntry.hash : true

  if (!libraryEntry) {
    const baseVersion = projectEntry?.version ?? 0
    const nextVersion = projectEntry
      ? projectChanged
        ? baseVersion + 1
        : Math.max(baseVersion, 1)
      : 1
    const nextEntry = { version: nextVersion, hash: projectHash }

    copySkillDir(projectSkillDir, librarySkillDir)
    writeLockFile(libraryContext.lockFilePath, setLockEntry(libraryLock, skill, nextEntry))
    writeLockFile(projectContext.lockFilePath, setLockEntry(projectLock, skill, nextEntry))

    return { success: true }
  }

  if (projectEntry) {
    const libraryAdvanced =
      libraryEntry.version !== projectEntry.version || libraryEntry.hash !== projectEntry.hash

    if (projectChanged && libraryAdvanced) {
      return {
        success: false,
        error: `Skill '${skill}' has diverged. Resolve conflicts before pushing.`,
        exitCode: 2,
      }
    }

    if (!projectChanged && libraryAdvanced) {
      return { success: false, error: `Skill '${skill}' is behind the library. Pull first.`, exitCode: 1 }
    }

    if (!projectChanged && !libraryAdvanced) {
      return { success: true, alreadyUpToDate: true }
    }
  }

  const nextVersion = libraryEntry.version + 1
  const nextEntry = { version: nextVersion, hash: projectHash }

  copySkillDir(projectSkillDir, librarySkillDir)

  const updatedLibraryLock = setLockEntry(libraryLock, skill, nextEntry)
  writeLockFile(libraryContext.lockFilePath, updatedLibraryLock)

  const updatedProjectLock = setLockEntry(projectLock, skill, nextEntry)
  writeLockFile(projectContext.lockFilePath, updatedProjectLock)

  return { success: true }
}

export default defineCommand({
  meta: {
    name: 'push',
    description: 'Push a project skill into the lock-based library',
  },
  args: {
    skill: {
      type: 'positional',
      description: 'Skill id to push',
      required: true,
    },
    project: {
      type: 'string',
      description: 'Project path (defaults to current directory)',
    },
  },
  run: async ({ args }) => {
    const { skill: firstSkill, project } = args
    const projectPath = project ?? process.cwd()

    const skills = getAllSkillArgs(firstSkill)
    const results: Array<{
      skill: string
      success: boolean
      error?: string
      alreadyUpToDate?: boolean
      exitCode?: number
    }> = []

    for (const skill of skills) {
      const result = await pushSkill(skill, projectPath)
      results.push({ skill, ...result })

      if (result.success) {
        if (result.alreadyUpToDate) {
          process.stdout.write(pc.dim('✔ ') + `Skill '${skill}' is already up to date.\n`)
        } else {
          process.stdout.write(pc.green('✔ ') + `Pushed skill '${pc.bold(skill)}' to library\n`)
        }
      } else {
        process.stdout.write(pc.red('✗ ') + `${result.error}\n`)
      }
    }

    const successCount = results.filter((r) => r.success).length
    const failCount = results.filter((r) => !r.success).length

    process.stdout.write(
      pc.dim(`${successCount} pushed${failCount > 0 ? `, ${failCount} failed` : ''}`) + '\n',
    )

    if (failCount > 0) {
      if (skills.length === 1) {
        const failedResult = results.find((r) => !r.success)
        process.exit(failedResult?.exitCode ?? 1)
      } else {
        process.exit(1)
      }
    }
  },
})
