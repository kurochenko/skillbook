import { defineCommand } from 'citty'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { extractSkillName, validateSkillName } from '../lib/skills.ts'
import { addSkillToLibrary, skillExists, getSkillContent } from '../lib/library.ts'

export default defineCommand({
  meta: {
    name: 'add',
    description: 'Add a skill to the library',
  },
  args: {
    path: {
      type: 'positional',
      description: 'Path to the skill file',
      required: true,
    },
    name: {
      type: 'string',
      alias: 'n',
      description: 'Skill name (optional, inferred from path if not provided)',
    },
    force: {
      type: 'boolean',
      alias: 'f',
      description: 'Overwrite existing skill without asking',
      default: false,
    },
  },
  run: async ({ args }) => {
    const { path: inputPath, name: providedName, force } = args

    const filePath = resolve(inputPath)

    if (!existsSync(filePath)) {
      p.log.error(pc.red(`File not found: ${inputPath}`))
      process.exit(1)
    }

    if (!filePath.endsWith('.md')) {
      p.log.error(pc.red('Skill file must be a .md file'))
      process.exit(1)
    }

    let skillName: string

    if (providedName) {
      const validation = validateSkillName(providedName)
      if (!validation.valid) {
        p.log.error(pc.red(`Invalid skill name: ${validation.error}`))
        process.exit(1)
      }
      skillName = validation.name
    } else {
      const extracted = extractSkillName(filePath)
      if (!extracted) {
        p.log.error(pc.red('Cannot determine skill name from path'))
        p.log.info(pc.dim('Use --name <name> to specify the skill name'))
        p.log.info(pc.dim('Example: skillbook add ./my-skill.md --name my-skill'))
        process.exit(1)
      }

      const validation = validateSkillName(extracted)
      if (!validation.valid) {
        p.log.error(pc.red(`Extracted name '${extracted}' is invalid: ${validation.error}`))
        p.log.info(pc.dim('Use --name <name> to specify a valid skill name'))
        process.exit(1)
      }
      skillName = validation.name
    }

    let content: string
    try {
      content = readFileSync(filePath, 'utf-8')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      p.log.error(pc.red(`Failed to read file: ${message}`))
      process.exit(1)
    }

    if (skillExists(skillName)) {
      const existingContent = getSkillContent(skillName)

      if (existingContent === content) {
        p.log.info(pc.cyan(`Skill '${skillName}' already up to date, skipped`))
        return
      }

      if (!force) {
        const shouldOverwrite = await p.confirm({
          message: `Skill '${skillName}' already exists. Overwrite?`,
          initialValue: false,
        })

        if (p.isCancel(shouldOverwrite) || !shouldOverwrite) {
          p.log.info(pc.dim('Cancelled'))
          process.exit(0)
        }
      }
    }

    const result = await addSkillToLibrary(skillName, content)

    if (!result.success) {
      p.log.error(pc.red(`Failed to add skill: ${result.error}`))
      process.exit(1)
    }

    if (result.action === 'skipped') {
      p.log.info(pc.cyan(`Skill '${skillName}' already up to date, skipped`))
      return
    }

    const actionVerb = result.action === 'added' ? 'Added' : 'Updated'
    const commitInfo = result.commitHash ? pc.dim(` (commit: ${result.commitHash})`) : ''

    p.log.success(`${actionVerb} skill '${pc.bold(skillName)}'${commitInfo}`)
    p.log.info(pc.dim(`Path: ${result.path}`))

    if (result.warning) {
      p.log.warn(pc.yellow(result.warning))
    }
  },
})
