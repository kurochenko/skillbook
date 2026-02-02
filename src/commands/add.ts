import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import pc from 'picocolors'

import { extractSkillName, validateSkillName } from '@/lib/skills'
import { addSkillToLibrary, getSkillContent } from '@/lib/library'
import { fail } from '@/commands/utils'

const readFileSafe = (filePath: string): string => {
  try {
    return readFileSync(filePath, 'utf-8')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    fail(`Failed to read file: ${message}`)
  }

  return ''
}

const resolveSkillName = (filePath: string, providedName?: string): string => {
  if (providedName) {
    const validation = validateSkillName(providedName)
    if (validation.valid) return validation.name
    fail(`Invalid skill name: ${validation.error}`)
  }

  const extracted = extractSkillName(filePath)
  if (!extracted) {
    p.log.error(pc.red('Cannot determine skill name from path'))
    p.log.info(pc.dim('Use --name <name> to specify the skill name'))
    p.log.info(pc.dim('Example: skillbook add ./my-skill.md --name my-skill'))
    process.exit(1)
  }

  const validation = validateSkillName(extracted)
  if (validation.valid) return validation.name

  p.log.error(pc.red(`Extracted name '${extracted}' is invalid: ${validation.error}`))
  p.log.info(pc.dim('Use --name <name> to specify a valid skill name'))
  process.exit(1)
}

const runSingleAdd = async (inputPath: string, providedName: string | undefined, force: boolean) => {
  const filePath = resolve(inputPath)

  if (!existsSync(filePath)) {
    fail(`File not found: ${inputPath}`)
  }

  if (!filePath.endsWith('.md')) {
    fail('Skill file must be a .md file')
  }

  const skillName = resolveSkillName(filePath, providedName)
  const content = readFileSafe(filePath)

  const existingContent = getSkillContent(skillName)
  if (existingContent !== null) {
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

  if (result.success) {
    const actionVerb = result.action === 'added' ? 'Added' : 'Updated'
    const commitInfo = result.commitHash ? pc.dim(` (commit: ${result.commitHash})`) : ''

    p.log.success(`${actionVerb} skill '${pc.bold(skillName)}'${commitInfo}`)
    p.log.info(pc.dim(`Path: ${result.path}`))

    if (result.warning) {
      p.log.warn(pc.yellow(result.warning))
    }
    return
  }

  fail(`Failed to add skill: ${result.error}`)
}

export default defineCommand({
  meta: {
    name: 'add',
    description: 'Add a skill to the library',
  },
  args: {
    path: {
      type: 'positional',
      description: 'Path to the skill file',
      required: false,
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

    if (!inputPath) {
      p.log.error(pc.red('Path is required'))
      p.log.info(pc.dim('Usage: skillbook add <path>'))
      p.log.info(pc.dim('For bulk operations, use: skillbook scan'))
      process.exit(1)
    }

    await runSingleAdd(inputPath, providedName, force)
  },
})
