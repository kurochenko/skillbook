import { defineCommand } from 'citty'
import pc from 'picocolors'

import { pushSkill } from '@/lib/lock-operations'
import { resolveSkills } from '@/commands/utils'

export default defineCommand({
  meta: {
    name: 'push',
    description: 'Push a project skill into the lock-based library',
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
    }> = []

    for (const skill of resolvedSkills) {
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
      const maxExitCode = Math.max(...results.filter(r => !r.success).map(r => r.exitCode ?? 1))
      process.exit(maxExitCode)
    }
  },
})
