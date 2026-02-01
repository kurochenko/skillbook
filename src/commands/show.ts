import { existsSync } from 'fs'
import { join } from 'path'
import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import pc from 'picocolors'

import { SKILL_FILE } from '@/constants'
import { computeSkillHash } from '@/lib/skill-hash'
import { readLockFile } from '@/lib/lockfile'
import { getLockFilePath, getLockLibraryPath, getLockSkillsPath, getProjectLockRoot } from '@/lib/lock-paths'

const fail = (message: string, exitCode = 1): never => {
  p.log.error(pc.red(message))
  process.exit(exitCode)
}

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
    const rootPath = library ? getLockLibraryPath() : getProjectLockRoot(project ?? process.cwd())
    const skillsPath = getLockSkillsPath(rootPath)
    const skillDir = join(skillsPath, skill)
    const skillFile = join(skillDir, SKILL_FILE)

    if (!existsSync(skillFile)) {
      fail(`Skill not found in ${scope}: ${skill}`)
    }

    const lock = readLockFile(getLockFilePath(rootPath))
    const entry = lock.skills[skill] ?? null
    const hash = await computeSkillHash(skillDir)

    if (json) {
      process.stdout.write(JSON.stringify({ scope, id: skill, hash, entry }))
      return
    }

    p.log.info(pc.dim(`${scope}: ${rootPath}`))
    p.log.info(`Skill: ${pc.bold(skill)}`)
    p.log.info(pc.dim(`Hash: ${hash}`))
    if (entry) {
      p.log.info(pc.dim(`Version: ${entry.version}`))
    } else {
      p.log.warn(pc.yellow('No lock entry found'))
    }
  },
})
