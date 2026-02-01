import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import pc from 'picocolors'

import { SKILL_FILE } from '@/constants'
import { copySkillDir } from '@/lib/lock-copy'
import { computeSkillHash } from '@/lib/skill-hash'
import { readLockFile, setLockEntry, writeLockFile } from '@/lib/lockfile'
import { getLockFilePath, getLockSkillsPath, getProjectLockRoot } from '@/lib/lock-paths'

const fail = (message: string, exitCode = 1): never => {
  p.log.error(pc.red(message))
  process.exit(exitCode)
}

export default defineCommand({
  meta: {
    name: 'migrate',
    description: 'Migrate legacy .skillbook structure into lock-based .SB',
  },
  args: {
    from: {
      type: 'string',
      description: 'Migration source (legacy)',
      required: true,
    },
    project: {
      type: 'string',
      description: 'Project path (defaults to current directory)',
    },
  },
  run: async ({ args }) => {
    const projectPath = args.project ?? process.cwd()
    if (args.from !== 'legacy') {
      fail('Only --from legacy is supported')
    }

    const legacySkillsPath = join(projectPath, '.skillbook', 'skills')
    if (!existsSync(legacySkillsPath)) {
      fail(`Legacy skills not found at ${legacySkillsPath}`)
    }

    const projectRoot = getProjectLockRoot(projectPath)
    const targetSkillsPath = getLockSkillsPath(projectRoot)
    const lockPath = getLockFilePath(projectRoot)
    let lock = readLockFile(lockPath)

    const entries = readdirSync(legacySkillsPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => existsSync(join(legacySkillsPath, name, SKILL_FILE)))

    if (entries.length === 0) {
      p.log.info(pc.dim('No legacy skills found to migrate'))
      return
    }

    for (const skillId of entries) {
      const sourceDir = join(legacySkillsPath, skillId)
      const targetDir = join(targetSkillsPath, skillId)
      copySkillDir(sourceDir, targetDir)
      const hash = await computeSkillHash(targetDir)
      lock = setLockEntry(lock, skillId, { version: 1, hash })
      writeLockFile(lockPath, lock)
    }

    p.log.success(`Migrated ${entries.length} skill${entries.length === 1 ? '' : 's'} to .SB`)
    p.log.info(pc.dim(`Project: ${projectPath}`))
  },
})
