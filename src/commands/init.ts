import { existsSync, mkdirSync } from 'fs'
import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import pc from 'picocolors'

import { createEmptyLockFile, readLockFile, writeLockFile } from '@/lib/lockfile'
import { getLockFilePath, getLockLibraryPath, getLockSkillsPath, getProjectLockRoot } from '@/lib/lock-paths'

const ensureDir = (path: string): boolean => {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true })
    return true
  }

  return false
}

const ensureLockFile = (path: string): boolean => {
  if (!existsSync(path)) {
    writeLockFile(path, createEmptyLockFile())
    return true
  }

  const lock = readLockFile(path)
  writeLockFile(path, lock)
  return false
}

export default defineCommand({
  meta: {
    name: 'init',
    description: 'Initialize lock-based .SB structure',
  },
  args: {
    library: {
      type: 'boolean',
      description: 'Initialize the lock-based library at ~/.SB or SKILLBOOK_LOCK_LIBRARY',
      default: false,
    },
    project: {
      type: 'boolean',
      description: 'Initialize the lock-based project folder in <project>/.SB',
      default: false,
    },
    path: {
      type: 'string',
      description: 'Project path when using --project (defaults to cwd)',
    },
  },
  run: async ({ args }) => {
    const { library, project, path } = args

    if (!library && !project) {
      p.log.error(pc.red('Specify --library or --project'))
      process.exit(1)
    }

    if (library) {
      const libraryPath = getLockLibraryPath()
      const createdLibrary = ensureDir(libraryPath)
      const createdSkills = ensureDir(getLockSkillsPath(libraryPath))
      const createdLock = ensureLockFile(getLockFilePath(libraryPath))

      p.log.success(createdLibrary ? 'Library initialized' : 'Library ready')
      p.log.info(pc.dim(`Skills: ${getLockSkillsPath(libraryPath)}`))
      p.log.info(pc.dim(`Lock file: ${getLockFilePath(libraryPath)}`))

      if (!createdLibrary && !createdSkills && !createdLock) {
        p.log.info(pc.dim('No changes needed'))
      }
    }

    if (project) {
      const projectPath = path ?? process.cwd()
      const projectRoot = getProjectLockRoot(projectPath)
      const createdRoot = ensureDir(projectRoot)
      const createdSkills = ensureDir(getLockSkillsPath(projectRoot))
      const createdLock = ensureLockFile(getLockFilePath(projectRoot))

      p.log.success(createdRoot ? 'Project initialized' : 'Project ready')
      p.log.info(pc.dim(`Skills: ${getLockSkillsPath(projectRoot)}`))
      p.log.info(pc.dim(`Lock file: ${getLockFilePath(projectRoot)}`))

      if (!createdRoot && !createdSkills && !createdLock) {
        p.log.info(pc.dim('No changes needed'))
      }
    }
  },
})
