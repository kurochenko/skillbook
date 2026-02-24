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
  writeLockFile,
} from '@/lib/lockfile'
import { getLibraryLockContext, getProjectLockContext } from '@/lib/lock-context'
import { getSkillDir } from '@/lib/skill-fs'
import { resolveSkills } from '@/commands/utils'

const installSkill = (
  skill: string,
  projectPath: string,
  force = false,
): {
  success: boolean
  error?: string
  conflicts?: number
  drifted?: number
  fallbackHarnesses?: ToolId[]
} => {
  const projectContext = getProjectLockContext(projectPath)
  const libraryContext = getLibraryLockContext()
  const projectSkillDir = getSkillDir(projectContext.skillsPath, skill)
  const librarySkillDir = getSkillDir(libraryContext.skillsPath, skill)

  if (!existsSync(librarySkillDir)) {
    return { success: false, error: `Skill not found in library: ${skill}` }
  }

  if (existsSync(projectSkillDir)) {
    if (force) {
      // Continue with overwriting
    } else {
      return { success: false, error: `Skill already exists in project: ${skill}. Use --force to overwrite.` }
    }
  }

  const libraryLock = readLockFile(libraryContext.lockFilePath)
  const entry = libraryLock.skills[skill]

  if (!entry) {
    return { success: false, error: `No lock entry found for skill in library: ${skill}` }
  }

  copySkillDir(librarySkillDir, projectSkillDir)

  const projectLock = readLockFile(projectContext.lockFilePath)
  const updated = setLockEntry(projectLock, skill, {
    version: entry.version,
    hash: entry.hash,
    updatedAt: entry.updatedAt,
  })
  writeLockFile(projectContext.lockFilePath, updated)

  const harnesses = (updated.harnesses ?? [])
    .filter((h): h is ToolId => SUPPORTED_TOOLS.includes(h as ToolId))

  let conflicts = 0
  let drifted = 0
  const fallbackHarnesses: ToolId[] = []
  let nextProjectLock = updated

  for (const harnessId of harnesses) {
    const result = linkSkillToHarness(projectPath, harnessId, skill, {
      mode: getHarnessMode(nextProjectLock, harnessId),
      force: true,
      allowModeFallback: true,
    })

    if (result.conflict) conflicts += 1
    if (result.drifted) drifted += 1

    if (result.fallbackToCopy && getHarnessMode(nextProjectLock, harnessId) !== result.mode) {
      nextProjectLock = setHarnessMode(nextProjectLock, harnessId, result.mode)
      fallbackHarnesses.push(harnessId)
    }
  }

  if (fallbackHarnesses.length > 0) {
    writeLockFile(projectContext.lockFilePath, nextProjectLock)
  }

  return { success: true, conflicts, drifted, fallbackHarnesses }
}

export default defineCommand({
  meta: {
    name: 'install',
    description: 'Install a skill from the lock-based library into a project',
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
    force: {
      type: 'boolean',
      description: 'Overwrite if skill already exists in project',
      default: false,
    },
  },
  run: async ({ args }) => {
    const { skill, skills, project, force } = args
    const projectPath = project ?? process.cwd()

    const resolvedSkills = resolveSkills(skill, skills)
    const results: Array<{
      skill: string
      success: boolean
      error?: string
      conflicts?: number
      drifted?: number
      fallbackHarnesses?: ToolId[]
    }> = []

    for (const skill of resolvedSkills) {
      const result = installSkill(skill, projectPath, force)
      results.push({ skill, ...result })

      if (result.success) {
        process.stdout.write(pc.green('✔ ') + `Installed skill '${pc.bold(skill)}'\n`)
        if (result.conflicts && result.conflicts > 0) {
          process.stdout.write(
            pc.yellow(
              `  ${result.conflicts} harness link${result.conflicts === 1 ? '' : 's'} skipped (existing non-symlink).\n`,
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
      } else {
        process.stdout.write(pc.red('✗ ') + `${result.error}\n`)
      }
    }

    const successCount = results.filter((r) => r.success).length
    const failCount = results.filter((r) => !r.success).length

    process.stdout.write(
      pc.dim(
        `${successCount} installed${failCount > 0 ? `, ${failCount} failed` : ''}`,
      ) + '\n',
    )

    if (failCount > 0) {
      process.exit(1)
    }
  },
})
