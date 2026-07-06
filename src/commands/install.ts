import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import pc from 'picocolors'

import { type ToolId } from '@/constants'
import { listSkills } from '@/lib/library'
import { installSkill } from '@/lib/lock-operations'
import { getLibraryLockContext, getProjectLockContext } from '@/lib/lock-context'
import { type LockEntry } from '@/lib/lockfile'
import { listSkillIds } from '@/lib/skill-fs'
import { readLockFileOrFail, resolveSkills } from '@/commands/utils'

type InstallableSkillOption = {
  value: string
  label: string
  hint?: string
}

export const getInstallableSkillOptions = (
  librarySkills: string[],
  installedSkills: string[],
  libraryEntries: Record<string, LockEntry | undefined>,
): InstallableSkillOption[] => {
  const installed = new Set(installedSkills)

  return librarySkills
    .filter((skill) => !installed.has(skill))
    .map((skill) => {
      const entry = libraryEntries[skill]
      const hint = entry
        ? [
            `v${entry.version}`,
            entry.updatedAt ? `updated ${entry.updatedAt}` : null,
          ].filter(Boolean).join(' ')
        : undefined

      return {
        value: skill,
        label: skill,
        hint,
      }
    })
}

const resolveInteractiveSkills = async (projectPath: string): Promise<string[] | null> => {
  const librarySkills = listSkills()

  if (librarySkills.length === 0) {
    p.log.info('No skills in the library')
    return null
  }

  const projectContext = getProjectLockContext(projectPath)
  const installedSkills = listSkillIds(projectContext.skillsPath)
  const libraryContext = getLibraryLockContext()
  const libraryLock = readLockFileOrFail(libraryContext.lockFilePath)
  const options = getInstallableSkillOptions(librarySkills, installedSkills, libraryLock.skills)

  if (options.length === 0) {
    p.log.info('All library skills are already installed in this project')
    return null
  }

  const selected = await p.multiselect({
    message: 'Select skills to install',
    options,
    required: false,
  })

  if (p.isCancel(selected)) {
    p.log.info(pc.dim('Cancelled'))
    return null
  }

  return Array.from(selected)
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

    const hasSkillArgs = skill !== undefined || skills !== undefined
    const resolvedSkills = hasSkillArgs || !process.stdin.isTTY || !process.stdout.isTTY
      ? resolveSkills(skill, skills)
      : await resolveInteractiveSkills(projectPath)

    if (!resolvedSkills) {
      return
    }

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
