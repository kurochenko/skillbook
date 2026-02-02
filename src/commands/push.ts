import { existsSync } from 'fs'
import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import pc from 'picocolors'

import { copySkillDir } from '@/lib/lock-copy'
import { readLockFile, setLockEntry, writeLockFile } from '@/lib/lockfile'
import { computeSkillHash } from '@/lib/skill-hash'
import { getLibraryLockContext, getProjectLockContext } from '@/lib/lock-context'
import { getSkillDir } from '@/lib/skill-fs'
import { fail } from '@/commands/utils'

export default defineCommand({
  meta: {
    name: 'push',
    description: 'Push a project skill into the lock-based library',
  },
  args: {
    skill: {
      type: 'positional',
      description: 'Skill id to push',
      required: true,
    },
    project: {
      type: 'string',
      description: 'Project path (defaults to current directory)',
    },
  },
  run: async ({ args }) => {
    const { skill, project } = args
    const projectPath = project ?? process.cwd()
    const projectContext = getProjectLockContext(projectPath)
    const projectSkillDir = getSkillDir(projectContext.skillsPath, skill)

    if (!existsSync(projectSkillDir)) {
      fail(`Skill not found in project: ${skill}`)
    }

    const libraryContext = getLibraryLockContext()
    const librarySkillDir = getSkillDir(libraryContext.skillsPath, skill)

    const libraryLock = readLockFile(libraryContext.lockFilePath)
    const projectLock = readLockFile(projectContext.lockFilePath)
    const projectEntry = projectLock.skills[skill]
    const libraryEntry = libraryLock.skills[skill]

    const projectHash = await computeSkillHash(projectSkillDir)

    if (!projectEntry && libraryEntry) {
      fail(`Skill '${skill}' exists in library but has no project lock entry. Install first.`, 2)
    }

    const projectChanged = projectEntry ? projectHash !== projectEntry.hash : true

    if (!libraryEntry) {
      const baseVersion = projectEntry?.version ?? 0
      const nextVersion = projectEntry
        ? projectChanged
          ? baseVersion + 1
          : Math.max(baseVersion, 1)
        : 1
      const nextEntry = { version: nextVersion, hash: projectHash }

      copySkillDir(projectSkillDir, librarySkillDir)
      writeLockFile(libraryContext.lockFilePath, setLockEntry(libraryLock, skill, nextEntry))
      writeLockFile(projectContext.lockFilePath, setLockEntry(projectLock, skill, nextEntry))

      p.log.success(`Pushed skill '${pc.bold(skill)}' to library`)
      return
    }

    if (projectEntry) {
      const libraryAdvanced =
        libraryEntry.version !== projectEntry.version || libraryEntry.hash !== projectEntry.hash

      if (projectChanged && libraryAdvanced) {
        fail(`Skill '${skill}' has diverged. Resolve conflicts before pushing.`, 2)
      }

      if (!projectChanged && libraryAdvanced) {
        fail(`Skill '${skill}' is behind the library. Pull first.`, 1)
      }

      if (!projectChanged && !libraryAdvanced) {
        p.log.info(pc.dim(`Skill '${skill}' is already up to date.`))
        return
      }
    }

    const nextVersion = libraryEntry.version + 1
    const nextEntry = { version: nextVersion, hash: projectHash }

    copySkillDir(projectSkillDir, librarySkillDir)

    const updatedLibraryLock = setLockEntry(libraryLock, skill, nextEntry)
    writeLockFile(libraryContext.lockFilePath, updatedLibraryLock)

    const updatedProjectLock = setLockEntry(projectLock, skill, nextEntry)
    writeLockFile(projectContext.lockFilePath, updatedProjectLock)

    p.log.success(`Pushed skill '${pc.bold(skill)}' to library`)
  },
})
