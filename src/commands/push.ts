import { existsSync } from 'fs'
import { join } from 'path'
import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import pc from 'picocolors'

import { copySkillDir } from '@/lib/lock-copy'
import { getLockFilePath, getLockLibraryPath, getLockSkillsPath, getProjectLockRoot } from '@/lib/lock-paths'
import { readLockFile, setLockEntry, writeLockFile } from '@/lib/lockfile'
import { computeSkillHash } from '@/lib/skill-hash'

const fail = (message: string, exitCode = 1): never => {
  p.log.error(pc.red(message))
  process.exit(exitCode)
}

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
    const projectRoot = getProjectLockRoot(projectPath)
    const projectSkillsPath = getLockSkillsPath(projectRoot)
    const projectSkillDir = join(projectSkillsPath, skill)

    if (!existsSync(projectSkillDir)) {
      fail(`Skill not found in project: ${skill}`)
    }

    const libraryPath = getLockLibraryPath()
    const librarySkillsPath = getLockSkillsPath(libraryPath)
    const librarySkillDir = join(librarySkillsPath, skill)

    const libraryLockPath = getLockFilePath(libraryPath)
    const projectLockPath = getLockFilePath(projectRoot)
    const libraryLock = readLockFile(libraryLockPath)
    const projectLock = readLockFile(projectLockPath)
    const projectEntry = projectLock.skills[skill]
    const libraryEntry = libraryLock.skills[skill]

    const projectHash = await computeSkillHash(projectSkillDir)

    if (!projectEntry && libraryEntry) {
      fail(`Skill '${skill}' exists in library but has no project lock entry. Install first.`, 2)
    }

    if (projectEntry) {
      const projectChanged = projectHash !== projectEntry.hash
      const libraryAdvanced =
        libraryEntry
          ? libraryEntry.version !== projectEntry.version || libraryEntry.hash !== projectEntry.hash
          : false

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

    const nextVersion = libraryEntry ? libraryEntry.version + 1 : 1
    const nextEntry = { version: nextVersion, hash: projectHash }

    copySkillDir(projectSkillDir, librarySkillDir)

    const updatedLibraryLock = setLockEntry(libraryLock, skill, nextEntry)
    writeLockFile(libraryLockPath, updatedLibraryLock)

    const updatedProjectLock = setLockEntry(projectLock, skill, nextEntry)
    writeLockFile(projectLockPath, updatedProjectLock)

    p.log.success(`Pushed skill '${pc.bold(skill)}' to library`)
    p.log.info(pc.dim(`Project: ${projectPath}`))
    p.log.info(pc.dim(`Library: ${libraryPath}`))
  },
})
