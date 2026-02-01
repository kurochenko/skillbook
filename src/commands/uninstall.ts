import { existsSync, rmSync } from 'fs'
import { join } from 'path'
import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import pc from 'picocolors'

import { SKILL_FILE, type ToolId } from '@/constants'
import { getLockFilePath, getLockSkillsPath, getProjectLockRoot } from '@/lib/lock-paths'
import { readLockFile, writeLockFile } from '@/lib/lockfile'
import { unlinkSkillFromHarness } from '@/lib/lock-harness'

const fail = (message: string, exitCode = 1): never => {
  p.log.error(pc.red(message))
  process.exit(exitCode)
}

const removeIfExists = (path: string) => {
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
    const projectRoot = getProjectLockRoot(projectPath)

    const skillDir = join(getLockSkillsPath(projectRoot), skill)
    if (!existsSync(skillDir)) {
      fail(`Skill not found in project: ${skill}`)
    }

    removeIfExists(skillDir)

    const lockPath = getLockFilePath(projectRoot)
    const lock = readLockFile(lockPath)
    if (lock.skills[skill]) {
      const { [skill]: _removed, ...rest } = lock.skills
      writeLockFile(lockPath, { ...lock, skills: rest })
    }

    const harnesses = (lock.harnesses ?? [])
      .filter((h): h is ToolId => ['claude-code', 'cursor', 'opencode'].includes(h))

    for (const harnessId of harnesses) {
      unlinkSkillFromHarness(projectPath, harnessId, skill)
    }

    p.log.success(`Uninstalled skill '${pc.bold(skill)}'`)
  },
})
