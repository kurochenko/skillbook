import { existsSync } from 'fs'
import { defineCommand } from 'citty'
import pc from 'picocolors'

import { copySkillDir } from '@/lib/lock-copy'
import { readLockFile, setLockEntry, writeLockFile } from '@/lib/lockfile'
import { computeSkillHash } from '@/lib/skill-hash'
import { getLibraryLockContext, getProjectLockContext } from '@/lib/lock-context'
import { getSkillDir } from '@/lib/skill-fs'
import { resolveSkills } from '@/commands/utils'

const pullSkill = async (
  skill: string,
  projectPath: string,
): Promise<{ success: boolean; error?: string; alreadyUpToDate?: boolean }> => {
  const projectContext = getProjectLockContext(projectPath)
  const libraryContext = getLibraryLockContext()
  const projectSkillDir = getSkillDir(projectContext.skillsPath, skill)
  const librarySkillDir = getSkillDir(libraryContext.skillsPath, skill)

  if (!existsSync(librarySkillDir)) {
    return { success: false, error: `Skill not found in library: ${skill}` }
  }

  const libraryLock = readLockFile(libraryContext.lockFilePath)
  const projectLock = readLockFile(projectContext.lockFilePath)
  const libraryEntry = libraryLock.skills[skill]
  const projectEntry = projectLock.skills[skill]

  if (!libraryEntry) {
    return { success: false, error: `No lock entry found for skill in library: ${skill}` }
  }

  if (!existsSync(projectSkillDir)) {
    copySkillDir(librarySkillDir, projectSkillDir)
    const updated = setLockEntry(projectLock, skill, {
      version: libraryEntry.version,
      hash: libraryEntry.hash,
      updatedAt: libraryEntry.updatedAt,
    })
    writeLockFile(projectContext.lockFilePath, updated)
    return { success: true }
  }

  if (!projectEntry) {
    return {
      success: false,
      error: `Skill '${skill}' is not linked to a lock entry. Run install instead.`,
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
    }
  }

  if (projectChanged && !libraryAdvanced) {
    return { success: false, error: `Skill '${skill}' has local changes. Push before pulling.` }
  }

  if (!projectChanged && !libraryAdvanced) {
    return { success: true, alreadyUpToDate: true }
  }

  copySkillDir(librarySkillDir, projectSkillDir)
  const updated = setLockEntry(projectLock, skill, {
    version: libraryEntry.version,
    hash: libraryEntry.hash,
    updatedAt: libraryEntry.updatedAt,
  })
  writeLockFile(projectContext.lockFilePath, updated)

  return { success: true }
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
    }> = []

    for (const skill of resolvedSkills) {
      const result = await pullSkill(skill, projectPath)
      results.push({ skill, ...result })

      if (result.success) {
        if (result.alreadyUpToDate) {
          process.stdout.write(pc.dim('✔ ') + `Skill '${skill}' is already up to date.\n`)
        } else {
          process.stdout.write(pc.green('✔ ') + `Pulled skill '${pc.bold(skill)}'\n`)
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
      process.exit(1)
    }
  },
})
