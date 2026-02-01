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
    name: 'pull',
    description: 'Pull a skill from the lock-based library into a project',
  },
  args: {
    skill: {
      type: 'positional',
      description: 'Skill id to pull',
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

    const libraryPath = getLockLibraryPath()
    const librarySkillsPath = getLockSkillsPath(libraryPath)
    const librarySkillDir = join(librarySkillsPath, skill)

    if (!existsSync(librarySkillDir)) {
      fail(`Skill not found in library: ${skill}`)
    }

    const libraryLockPath = getLockFilePath(libraryPath)
    const projectLockPath = getLockFilePath(projectRoot)
    const libraryLock = readLockFile(libraryLockPath)
    const projectLock = readLockFile(projectLockPath)
    const libraryEntry = libraryLock.skills[skill]
    const projectEntry = projectLock.skills[skill]

    if (!libraryEntry) {
      fail(`No lock entry found for skill in library: ${skill}`)
    }

    if (!existsSync(projectSkillDir)) {
      copySkillDir(librarySkillDir, projectSkillDir)
      const updated = setLockEntry(projectLock, skill, {
        version: libraryEntry.version,
        hash: libraryEntry.hash,
        updatedAt: libraryEntry.updatedAt,
      })
      writeLockFile(projectLockPath, updated)
      p.log.success(`Pulled skill '${pc.bold(skill)}' into project`)
      return
    }

    if (!projectEntry) {
      fail(`Skill '${skill}' is not linked to a lock entry. Run install instead.`, 2)
    }

    const projectHash = await computeSkillHash(projectSkillDir)
    const projectChanged = projectHash !== projectEntry.hash
    const libraryAdvanced =
      libraryEntry.version !== projectEntry.version || libraryEntry.hash !== projectEntry.hash

    if (projectChanged && libraryAdvanced) {
      fail(`Skill '${skill}' has diverged. Resolve conflicts before pulling.`, 2)
    }

    if (projectChanged && !libraryAdvanced) {
      fail(`Skill '${skill}' has local changes. Push before pulling.`, 2)
    }

    if (!projectChanged && !libraryAdvanced) {
      p.log.info(pc.dim(`Skill '${skill}' is already up to date.`))
      return
    }

    copySkillDir(librarySkillDir, projectSkillDir)
    const updated = setLockEntry(projectLock, skill, {
      version: libraryEntry.version,
      hash: libraryEntry.hash,
      updatedAt: libraryEntry.updatedAt,
    })
    writeLockFile(projectLockPath, updated)

    p.log.success(`Pulled skill '${pc.bold(skill)}'`)
    p.log.info(pc.dim(`Project: ${projectPath}`))
    p.log.info(pc.dim(`Library: ${libraryPath}`))
  },
})
