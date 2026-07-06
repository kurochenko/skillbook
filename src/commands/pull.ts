import { defineCommand } from 'citty'
import pc from 'picocolors'

import { type ToolId } from '@/constants'
import { pullSkill } from '@/lib/lock-operations'
import { resolveSkills } from '@/commands/utils'

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
