import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import pc from 'picocolors'

import { SKILL_FILE } from '@/constants'
import { computeSkillHash } from '@/lib/skill-hash'
import { readLockFile, setLockEntry, writeLockFile } from '@/lib/lockfile'
import {
  getLockFilePath,
  getLockLibraryPath,
  getLockSkillsPath,
  getProjectLockRoot,
} from '@/lib/lock-paths'

const fail = (message: string, exitCode = 1): never => {
  p.log.error(pc.red(message))
  process.exit(exitCode)
}

export default defineCommand({
  meta: {
    name: 'migrate',
    description: 'Create lock entries for existing .skillbook skills',
  },
  args: {
    library: {
      type: 'boolean',
      description: 'Create lockfile for library skills in ~/.skillbook',
      default: false,
    },
    project: {
      type: 'string',
      description: 'Project path (defaults to current directory)',
    },
  },
  run: async ({ args }) => {
    if (args.library && args.project) {
      fail('Use either --library or --project, not both.')
    }

    const targetRoot = args.library
      ? getLockLibraryPath()
      : getProjectLockRoot(args.project ?? process.cwd())
    const skillsPath = getLockSkillsPath(targetRoot)
    const lockPath = getLockFilePath(targetRoot)

    if (!existsSync(skillsPath)) {
      fail(`Skills directory not found at ${skillsPath}`)
    }

    let lock = readLockFile(lockPath)
    const entries = readdirSync(skillsPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => existsSync(join(skillsPath, name, SKILL_FILE)))

    if (entries.length === 0) {
      p.log.info(pc.dim('No skills found to migrate'))
      return
    }

    for (const skillId of entries) {
      const skillDir = join(skillsPath, skillId)
      const hash = await computeSkillHash(skillDir)
      const existing = lock.skills[skillId]
      const version = existing?.version ?? 1
      lock = setLockEntry(lock, skillId, { version, hash })
    }

    writeLockFile(lockPath, lock)
    p.log.success(`Wrote lockfile for ${entries.length} skill${entries.length === 1 ? '' : 's'}`)
  },
})
