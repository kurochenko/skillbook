import { existsSync } from 'fs'
import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import pc from 'picocolors'

import { copySkillDir } from '@/lib/lock-copy'
import { SUPPORTED_TOOLS, type ToolId } from '@/constants'
import { linkSkillToHarness } from '@/lib/lock-harness'
import { readLockFile, setLockEntry, writeLockFile } from '@/lib/lockfile'
import { getLibraryLockContext, getProjectLockContext } from '@/lib/lock-context'
import { getSkillDir } from '@/lib/skill-fs'
import { fail } from '@/commands/utils'

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
    const projectContext = getProjectLockContext(projectPath)
    const libraryContext = getLibraryLockContext()
    const projectSkillDir = getSkillDir(projectContext.skillsPath, skill)
    const librarySkillDir = getSkillDir(libraryContext.skillsPath, skill)

    if (!existsSync(librarySkillDir)) {
      fail(`Skill not found in library: ${skill}`)
    }

    if (existsSync(projectSkillDir) && !force) {
      fail(`Skill already exists in project: ${skill}. Use --force to overwrite.`)
    }

    const libraryLock = readLockFile(libraryContext.lockFilePath)
    const entry = libraryLock.skills[skill]

    if (!entry) {
      fail(`No lock entry found for skill in library: ${skill}`)
    }

    copySkillDir(librarySkillDir, projectSkillDir)

    const projectLock = readLockFile(projectContext.lockFilePath)
    const updated = setLockEntry(projectLock, skill, {
      version: entry.version,
      hash: entry.hash,
      updatedAt: entry.updatedAt,
    })
    writeLockFile(projectContext.lockFilePath, updated)

    const harnesses = (updated.harnesses ?? [])
      .filter((h): h is ToolId => SUPPORTED_TOOLS.includes(h as ToolId))

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
