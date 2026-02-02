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
    const projectContext = getProjectLockContext(projectPath)
    const libraryContext = getLibraryLockContext()
    const projectSkillDir = getSkillDir(projectContext.skillsPath, skill)
    const librarySkillDir = getSkillDir(libraryContext.skillsPath, skill)

    if (!existsSync(librarySkillDir)) {
      fail(`Skill not found in library: ${skill}`)
    }

    const libraryLock = readLockFile(libraryContext.lockFilePath)
    const projectLock = readLockFile(projectContext.lockFilePath)
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
      writeLockFile(projectContext.lockFilePath, updated)
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
    writeLockFile(projectContext.lockFilePath, updated)

    p.log.success(`Pulled skill '${pc.bold(skill)}'`)
  },
})
