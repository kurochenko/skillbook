import { existsSync } from 'fs'
import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import pc from 'picocolors'

import { copySkillDir } from '@/lib/lock-copy'
import { computeSkillHash } from '@/lib/skill-hash'
import { SUPPORTED_TOOLS, type ToolId } from '@/constants'
import { linkSkillToHarness } from '@/lib/lock-harness'
import {
  getHarnessMode,
  readLockFile,
  setHarnessMode,
  setLockEntry,
  writeLockFile,
} from '@/lib/lockfile'
import { getLibraryLockContext, getProjectLockContext } from '@/lib/lock-context'
import { getSkillDir } from '@/lib/skill-fs'
import { fail } from '@/commands/utils'

type Strategy = 'library' | 'project' | 'merge'

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
      description: 'Resolution strategy (library, project, merge)',
      default: 'library',
    },
  },
  run: async ({ args }) => {
    const projectPath = args.project ?? process.cwd()
    const projectContext = getProjectLockContext(projectPath)
    const libraryContext = getLibraryLockContext()
    const skill = args.skill
    const strategy = args.strategy as Strategy

    if (!['library', 'project', 'merge'].includes(strategy)) {
      fail('Invalid strategy. Use library, project, or merge.')
    }

    const projectSkillDir = getSkillDir(projectContext.skillsPath, skill)
    const librarySkillDir = getSkillDir(libraryContext.skillsPath, skill)

    if (!existsSync(projectSkillDir) || !existsSync(librarySkillDir)) {
      fail(`Skill must exist in both project and library to resolve: ${skill}`)
    }

    const projectLock = readLockFile(projectContext.lockFilePath)
    const libraryLock = readLockFile(libraryContext.lockFilePath)
    const libraryEntry = libraryLock.skills[skill]

    if (!libraryEntry) {
      fail(`No lock entry for skill in library: ${skill}`)
    }

    if (strategy === 'merge') {
      fail('Merge strategy is not implemented. Resolve manually.', 2)
    }

    if (strategy === 'library') {
      copySkillDir(librarySkillDir, projectSkillDir)
      let updatedProjectLock = setLockEntry(projectLock, skill, {
        version: libraryEntry.version,
        hash: libraryEntry.hash,
        updatedAt: libraryEntry.updatedAt,
      })

      const harnesses = (updatedProjectLock.harnesses ?? [])
        .filter((h): h is ToolId => SUPPORTED_TOOLS.includes(h as ToolId))

      let conflicts = 0
      let drifted = 0
      const fallbackHarnesses: ToolId[] = []

      for (const harnessId of harnesses) {
        const result = linkSkillToHarness(projectPath, harnessId, skill, {
          mode: getHarnessMode(updatedProjectLock, harnessId),
          force: true,
          allowModeFallback: true,
        })

        if (result.conflict) conflicts += 1
        if (result.drifted) drifted += 1

        if (result.fallbackToCopy && getHarnessMode(updatedProjectLock, harnessId) !== result.mode) {
          updatedProjectLock = setHarnessMode(updatedProjectLock, harnessId, result.mode)
          fallbackHarnesses.push(harnessId)
        }
      }

      writeLockFile(projectContext.lockFilePath, updatedProjectLock)
      p.log.success(`Resolved '${skill}' using library version`)

      if (conflicts > 0) {
        p.log.warn(pc.yellow(`${conflicts} harness path${conflicts === 1 ? '' : 's'} skipped (conflict).`))
      }

      if (drifted > 0) {
        p.log.warn(
          pc.yellow(
            `${drifted} drifted harness copy${drifted === 1 ? '' : 'ies'} skipped (use 'skillbook harness sync --force').`,
          ),
        )
      }

      if (fallbackHarnesses.length > 0) {
        p.log.warn(pc.yellow(`Symlink fallback: switched to copy mode for ${fallbackHarnesses.join(', ')}.`))
      }

      return
    }

    const projectHash = await computeSkillHash(projectSkillDir)
    const nextVersion = libraryEntry.version + 1
    const nextEntry = { version: nextVersion, hash: projectHash }

    copySkillDir(projectSkillDir, librarySkillDir)
    writeLockFile(libraryContext.lockFilePath, setLockEntry(libraryLock, skill, nextEntry))
    writeLockFile(projectContext.lockFilePath, setLockEntry(projectLock, skill, nextEntry))
    p.log.success(`Resolved '${skill}' using project version`)
  },
})
