import { existsSync } from 'fs'
import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import pc from 'picocolors'

import { copySkillDir } from '@/lib/lock-copy'
import { computeSkillHash } from '@/lib/skill-hash'
import { syncSkillToHarnesses } from '@/lib/lock-operations'
import { setLockEntry, writeLockFile } from '@/lib/lockfile'
import { getLibraryLockContext, getProjectLockContext } from '@/lib/lock-context'
import { getSkillDir } from '@/lib/skill-fs'
import { fail, readLockFileOrFail } from '@/commands/utils'

type Strategy = 'library' | 'project'

export default defineCommand({
  meta: {
    name: 'resolve',
    description: 'Resolve diverged skill by choosing a strategy',
  },
  args: {
    skill: {
      type: 'positional',
      description: 'Skill id to resolve',
      required: true,
    },
    project: {
      type: 'string',
      description: 'Project path (defaults to current directory)',
    },
    strategy: {
      type: 'string',
      description: 'Resolution strategy (library, project)',
      default: 'library',
    },
  },
  run: async ({ args }) => {
    const projectPath = args.project ?? process.cwd()
    const projectContext = getProjectLockContext(projectPath)
    const libraryContext = getLibraryLockContext()
    const skill = args.skill
    const strategy = args.strategy as Strategy

    if (!['library', 'project'].includes(strategy)) {
      fail('Invalid strategy. Use library or project.')
    }

    const projectSkillDir = getSkillDir(projectContext.skillsPath, skill)
    const librarySkillDir = getSkillDir(libraryContext.skillsPath, skill)

    if (!existsSync(projectSkillDir) || !existsSync(librarySkillDir)) {
      fail(`Skill must exist in both project and library to resolve: ${skill}`)
    }

    const projectLock = readLockFileOrFail(projectContext.lockFilePath)
    const libraryLock = readLockFileOrFail(libraryContext.lockFilePath)
    const libraryEntry = libraryLock.skills[skill]

    if (!libraryEntry) {
      fail(`No lock entry for skill in library: ${skill}`)
    }

    if (strategy === 'library') {
      copySkillDir(librarySkillDir, projectSkillDir)
      let updatedProjectLock = setLockEntry(projectLock, skill, {
        version: libraryEntry.version,
        hash: libraryEntry.hash,
        updatedAt: libraryEntry.updatedAt,
      })

      const harnessSync = syncSkillToHarnesses(projectPath, skill, updatedProjectLock)
      updatedProjectLock = harnessSync.lock

      writeLockFile(projectContext.lockFilePath, updatedProjectLock)
      p.log.success(`Resolved '${skill}' using library version`)

      if (harnessSync.conflicts > 0) {
        p.log.warn(pc.yellow(`${harnessSync.conflicts} harness path${harnessSync.conflicts === 1 ? '' : 's'} skipped (conflict).`))
      }

      if (harnessSync.drifted > 0) {
        p.log.warn(
          pc.yellow(
            `${harnessSync.drifted} drifted harness copy${harnessSync.drifted === 1 ? '' : 'ies'} skipped (use 'skillbook harness sync --force').`,
          ),
        )
      }

      if (harnessSync.fallbackHarnesses.length > 0) {
        p.log.warn(pc.yellow(`Symlink fallback: switched to copy mode for ${harnessSync.fallbackHarnesses.join(', ')}.`))
      }

      return
    }

    const projectHash = await computeSkillHash(projectSkillDir)
    const nextVersion = libraryEntry.version + 1
    const nextEntry = { version: nextVersion, hash: projectHash, updatedAt: new Date().toISOString() }

    copySkillDir(projectSkillDir, librarySkillDir)
    writeLockFile(libraryContext.lockFilePath, setLockEntry(libraryLock, skill, nextEntry))
    writeLockFile(projectContext.lockFilePath, setLockEntry(projectLock, skill, nextEntry))
    p.log.success(`Resolved '${skill}' using project version`)
  },
})
