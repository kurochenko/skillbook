import { existsSync } from 'fs'
import { join } from 'path'
import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import pc from 'picocolors'

import { copySkillDir } from '@/lib/lock-copy'
import { type ToolId } from '@/constants'
import { linkSkillToHarness } from '@/lib/lock-harness'
import { getLockFilePath, getLockLibraryPath, getLockSkillsPath, getProjectLockRoot } from '@/lib/lock-paths'
import { readLockFile, setLockEntry, writeLockFile } from '@/lib/lockfile'

const fail = (message: string, exitCode = 1): never => {
  p.log.error(pc.red(message))
  process.exit(exitCode)
}

export default defineCommand({
  meta: {
    name: 'install',
    description: 'Install a skill from the lock-based library into a project',
  },
  args: {
    skill: {
      type: 'positional',
      description: 'Skill id to install',
      required: true,
    },
    project: {
      type: 'string',
      description: 'Project path (defaults to current directory)',
    },
    force: {
      type: 'boolean',
      description: 'Overwrite existing project skill',
      default: false,
    },
  },
  run: async ({ args }) => {
    const { skill, project, force } = args
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

    if (existsSync(projectSkillDir) && !force) {
      fail(`Skill already exists in project: ${skill}. Use --force to overwrite.`)
    }

    const libraryLockPath = getLockFilePath(libraryPath)
    const projectLockPath = getLockFilePath(projectRoot)
    const libraryLock = readLockFile(libraryLockPath)
    const entry = libraryLock.skills[skill]

    if (!entry) {
      fail(`No lock entry found for skill in library: ${skill}`)
    }

    copySkillDir(librarySkillDir, projectSkillDir)

    const projectLock = readLockFile(projectLockPath)
    const updated = setLockEntry(projectLock, skill, {
      version: entry.version,
      hash: entry.hash,
      updatedAt: entry.updatedAt,
    })
    writeLockFile(projectLockPath, updated)

    const harnesses = (updated.harnesses ?? [])
      .filter((h): h is ToolId => ['claude-code', 'cursor', 'opencode'].includes(h))

    let conflicts = 0
    for (const harnessId of harnesses) {
      const result = linkSkillToHarness(projectPath, harnessId, skill)
      if (result.conflict) conflicts += 1
    }

    p.log.success(`Installed skill '${pc.bold(skill)}'`)
    if (conflicts > 0) {
      p.log.warn(
        pc.yellow(
          `${conflicts} harness link${conflicts === 1 ? '' : 's'} skipped (existing non-symlink).`,
        ),
      )
    }
  },
})
