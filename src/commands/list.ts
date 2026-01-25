import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { listSkills } from '@/lib/library'
import { getLibraryPath, getSkillsPath } from '@/lib/paths'
import { existsSync } from 'fs'

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
      p.log.info(pc.dim('Run `skillbook add` to add skills'))
      return
    }

    const skills = listSkills()

    if (skills.length === 0) {
      p.log.info('No skills in the library')
      p.log.info(pc.dim('Run `skillbook add` to add skills'))
      return
    }

    console.log(pc.bold('\nAvailable skills:\n'))
    for (const skill of skills) {
      console.log(`  ${pc.cyan('•')} ${skill}`)
    }
    console.log('')
    p.log.info(pc.dim(`${skills.length} skill${skills.length === 1 ? '' : 's'} in ${libraryPath}`))
  },
})
