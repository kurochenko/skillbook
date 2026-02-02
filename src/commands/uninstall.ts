import { existsSync, rmSync } from 'fs'
import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import pc from 'picocolors'

import { SUPPORTED_TOOLS, type ToolId } from '@/constants'
import { readLockFile, writeLockFile } from '@/lib/lockfile'
import { unlinkSkillFromHarness } from '@/lib/lock-harness'
import { getProjectLockContext } from '@/lib/lock-context'
import { getSkillDir } from '@/lib/skill-fs'
import { fail } from '@/commands/utils'

const removeIfExists = (path: string): void => {
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true })
  }
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
    const projectPath = args.project ?? process.cwd()
    const skill = args.skill
    const projectContext = getProjectLockContext(projectPath)

    const skillDir = getSkillDir(projectContext.skillsPath, skill)
    if (!existsSync(skillDir)) {
      fail(`Skill not found in project: ${skill}`)
    }

    removeIfExists(skillDir)

    const lockPath = projectContext.lockFilePath
    const lock = readLockFile(lockPath)
    if (lock.skills[skill]) {
      const { [skill]: _removed, ...rest } = lock.skills
      writeLockFile(lockPath, { ...lock, skills: rest })
    }

    const harnesses = (lock.harnesses ?? [])
      .filter((h): h is ToolId => SUPPORTED_TOOLS.includes(h as ToolId))

    for (const harnessId of harnesses) {
      unlinkSkillFromHarness(projectPath, harnessId, skill)
    }

    p.log.success(`Uninstalled skill '${pc.bold(skill)}'`)
  },
})
