import { existsSync } from 'fs'

import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import pc from 'picocolors'

import { listSkills } from '@/lib/library'
import { SUPPORTED_TOOLS, TOOLS } from '@/constants'
import { getLibraryPath, getSkillsPath } from '@/lib/paths'

export default defineCommand({
  meta: {
    name: 'list',
    description: 'List available skills in the library',
  },
  run: async () => {
    const libraryPath = getLibraryPath()
    const skillsPath = getSkillsPath()

    if (!existsSync(skillsPath)) {
      p.log.warn('No skills library found')
      p.log.info(pc.dim(`Library path: ${libraryPath}`))
      p.log.info(pc.dim('Run `skillbook scan` to initialize'))
    } else {
      const skills = listSkills()

      if (skills.length === 0) {
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
    }

    console.log(pc.bold('\nSupported harnesses:\n'))
    for (const harness of SUPPORTED_TOOLS) {
      console.log(`  ${pc.cyan('•')} ${harness} ${pc.dim(`(${TOOLS[harness].name})`)}`)
    }
    console.log('')
  },
})
