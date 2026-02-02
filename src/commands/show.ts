import { existsSync } from 'fs'
import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import pc from 'picocolors'

import { computeSkillHash } from '@/lib/skill-hash'
import { readLockFile } from '@/lib/lockfile'
import { getLibraryLockContext, getProjectLockContext } from '@/lib/lock-context'
import { getSkillDir, getSkillFilePath } from '@/lib/skill-fs'
import { fail } from '@/commands/utils'

export default defineCommand({
  meta: {
    name: 'show',
    description: 'Show lock entry and hash for a skill',
  },
  args: {
    skill: {
      type: 'positional',
      description: 'Skill id to inspect',
      required: true,
    },
    project: {
      type: 'string',
      description: 'Project path (defaults to current directory)',
    },
    library: {
      type: 'boolean',
      description: 'Show library entry instead of project entry',
      default: false,
    },
    json: {
      type: 'boolean',
      description: 'Output machine-readable JSON',
      default: false,
    },
  },
  run: async ({ args }) => {
    const { skill, project, library, json } = args

    const scope = library ? 'library' : 'project'
    const context = library
      ? getLibraryLockContext()
      : getProjectLockContext(project ?? process.cwd())
    const skillDir = getSkillDir(context.skillsPath, skill)
    const skillFile = getSkillFilePath(context.skillsPath, skill)

    if (!existsSync(skillFile)) {
      fail(`Skill not found in ${scope}: ${skill}`)
    }

    const lock = readLockFile(context.lockFilePath)
    const entry = lock.skills[skill] ?? null
    const hash = await computeSkillHash(skillDir)

    if (json) {
      process.stdout.write(JSON.stringify({ scope, id: skill, hash, entry }))
      return
    }

    p.log.info(pc.dim(`${scope}: ${context.root}`))
    p.log.info(`Skill: ${pc.bold(skill)}`)
    p.log.info(pc.dim(`Hash: ${hash}`))
    if (entry) {
      p.log.info(pc.dim(`Version: ${entry.version}`))
    } else {
      p.log.warn(pc.yellow('No lock entry found'))
    }
  },
})
