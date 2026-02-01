import { existsSync } from 'fs'
import { join } from 'path'
import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import pc from 'picocolors'

import { copySkillDir } from '@/lib/lock-copy'
import { computeSkillHash } from '@/lib/skill-hash'
import { readLockFile, setLockEntry, writeLockFile } from '@/lib/lockfile'
import { getLockFilePath, getLockLibraryPath, getLockSkillsPath, getProjectLockRoot } from '@/lib/lock-paths'

const fail = (message: string, exitCode = 1): never => {
  p.log.error(pc.red(message))
  process.exit(exitCode)
}

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
    const projectRoot = getProjectLockRoot(projectPath)
    const libraryPath = getLockLibraryPath()
    const skill = args.skill
    const strategy = args.strategy as Strategy

    if (!['library', 'project', 'merge'].includes(strategy)) {
      fail('Invalid strategy. Use library, project, or merge.')
    }

    const projectSkillDir = join(getLockSkillsPath(projectRoot), skill)
    const librarySkillDir = join(getLockSkillsPath(libraryPath), skill)

    if (!existsSync(projectSkillDir) || !existsSync(librarySkillDir)) {
      fail(`Skill must exist in both project and library to resolve: ${skill}`)
    }

    const projectLockPath = getLockFilePath(projectRoot)
    const libraryLockPath = getLockFilePath(libraryPath)
    const projectLock = readLockFile(projectLockPath)
    const libraryLock = readLockFile(libraryLockPath)
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
      writeLockFile(projectLockPath, updatedProjectLock)
      p.log.success(`Resolved '${skill}' using library version`)
      return
    }

    const projectHash = await computeSkillHash(projectSkillDir)
    const nextVersion = libraryEntry.version + 1
    const nextEntry = { version: nextVersion, hash: projectHash }

    copySkillDir(projectSkillDir, librarySkillDir)
    writeLockFile(libraryLockPath, setLockEntry(libraryLock, skill, nextEntry))
    writeLockFile(projectLockPath, setLockEntry(projectLock, skill, nextEntry))
    p.log.success(`Resolved '${skill}' using project version`)
  },
})
