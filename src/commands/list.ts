import { existsSync } from 'fs'

import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import pc from 'picocolors'

import { listSkills } from '@/lib/library'
import { SUPPORTED_TOOLS, TOOLS } from '@/constants'
import { getLibraryPath, getSkillsPath } from '@/lib/paths'
import { getProjectLockContext } from '@/lib/lock-context'
import { listSkillIds } from '@/lib/skill-fs'

export default defineCommand({
  meta: {
    name: 'list',
    description: 'List available skills in the library',
  },
  args: {
    project: {
      type: 'string',
      description: 'Project path (lists .skillbook/skills)',
    },
    json: {
      type: 'boolean',
      description: 'Output machine-readable JSON',
      default: false,
    },
  },
  run: async ({ args }) => {
    const projectPath = args.project
    const isJson = args.json

    if (projectPath) {
      const projectContext = getProjectLockContext(projectPath)
      const skillsPath = projectContext.skillsPath
      const skills = listSkillIds(skillsPath)

      if (isJson) {
        process.stdout.write(JSON.stringify({ scope: 'project', path: projectPath, skills }))
        return
      }

      console.log(pc.bold('\nProject skills:\n'))
      if (skills.length === 0) {
        p.log.info(pc.dim('No skills installed in project'))
      } else {
        for (const skill of skills) {
          console.log(`  ${pc.cyan('•')} ${skill}`)
        }
        console.log('')
        p.log.info(pc.dim(`${skills.length} skill${skills.length === 1 ? '' : 's'} in ${projectPath}`))
      }
      return
    }

    const libraryPath = getLibraryPath()
    const skillsPath = getSkillsPath()

    const skills = existsSync(skillsPath) ? listSkills() : []

    if (isJson) {
      process.stdout.write(JSON.stringify({ scope: 'library', path: libraryPath, skills }))
      return
    }

    if (!existsSync(skillsPath)) {
      p.log.warn('No skills library found')
      p.log.info(pc.dim(`Library path: ${libraryPath}`))
      p.log.info(pc.dim('Run `skillbook scan` to initialize'))
    } else if (skills.length === 0) {
      p.log.info('No skills in the library')
      p.log.info(pc.dim('Run `skillbook add` to add skills'))
    } else {
      console.log(pc.bold('\nAvailable skills:\n'))
      for (const skill of skills) {
        console.log(`  ${pc.cyan('•')} ${skill}`)
      }
      console.log('')
      p.log.info(pc.dim(`${skills.length} skill${skills.length === 1 ? '' : 's'} in ${libraryPath}`))
    }

    console.log(pc.bold('\nSupported harnesses:\n'))
    for (const harness of SUPPORTED_TOOLS) {
      console.log(`  ${pc.cyan('•')} ${harness} ${pc.dim(`(${TOOLS[harness].name})`)}`)
    }
    console.log('')
  },
})
