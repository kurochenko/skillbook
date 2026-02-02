import { existsSync } from 'fs'
import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import pc from 'picocolors'

import { copySkillDir } from '@/lib/lock-copy'
import { computeSkillHash } from '@/lib/skill-hash'
import { readLockFile, setLockEntry, writeLockFile } from '@/lib/lockfile'
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
      const updatedProjectLock = setLockEntry(projectLock, skill, {
        version: libraryEntry.version,
        hash: libraryEntry.hash,
        updatedAt: libraryEntry.updatedAt,
      })
      writeLockFile(projectContext.lockFilePath, updatedProjectLock)
      p.log.success(`Resolved '${skill}' using library version`)
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
