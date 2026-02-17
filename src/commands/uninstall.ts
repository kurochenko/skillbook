import { existsSync, rmSync } from 'fs'
import { defineCommand } from 'citty'
import pc from 'picocolors'

import { SUPPORTED_TOOLS, type ToolId } from '@/constants'
import { readLockFile, writeLockFile } from '@/lib/lockfile'
import { unlinkSkillFromHarness } from '@/lib/lock-harness'
import { getProjectLockContext } from '@/lib/lock-context'
import { getSkillDir } from '@/lib/skill-fs'
import { getAllSkillArgs } from '@/commands/utils'

const removeIfExists = (path: string): void => {
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true })
  }
}

const uninstallSkill = (
  skill: string,
  projectPath: string,
): { success: boolean; error?: string } => {
  const projectContext = getProjectLockContext(projectPath)

  const skillDir = getSkillDir(projectContext.skillsPath, skill)
  if (!existsSync(skillDir)) {
    return { success: false, error: `Skill not found in project: ${skill}` }
  }

  removeIfExists(skillDir)

  const lockPath = projectContext.lockFilePath
  const lock = readLockFile(lockPath)
  if (lock.skills[skill]) {
    const { [skill]: _removed, ...rest } = lock.skills
    writeLockFile(lockPath, { ...lock, skills: rest })
  }

  const harnesses = (lock.harnesses ?? []).filter((h): h is ToolId => SUPPORTED_TOOLS.includes(h as ToolId))

  for (const harnessId of harnesses) {
    unlinkSkillFromHarness(projectPath, harnessId, skill)
  }

  return { success: true }
}

export default defineCommand({
  meta: {
    name: 'uninstall',
    description: 'Remove a skill from the project',
  },
  args: {
    skill: {
      type: 'positional',
      description: 'Skill id to remove',
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

    const skills = getAllSkillArgs('uninstall', firstSkill)
    const results: Array<{ skill: string; success: boolean; error?: string }> = []

    for (const skill of skills) {
      const result = uninstallSkill(skill, projectPath)
      results.push({ skill, ...result })

      if (result.success) {
        process.stdout.write(pc.green('✔ ') + `Uninstalled skill '${pc.bold(skill)}'\n`)
      } else {
        process.stdout.write(pc.red('✗ ') + `${result.error}\n`)
      }
    }

    const successCount = results.filter((r) => r.success).length
    const failCount = results.filter((r) => !r.success).length

    process.stdout.write(
      pc.dim(
        `${successCount} uninstalled${failCount > 0 ? `, ${failCount} failed` : ''}`,
      ) + '\n',
    )

    if (failCount > 0) {
      process.exit(1)
    }
  },
})
