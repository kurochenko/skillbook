import { existsSync, lstatSync, readFileSync } from 'fs'
import { resolve, join, basename } from 'path'

import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import pc from 'picocolors'

import { extractSkillName, validateSkillName } from '@/lib/skills'
import { addSkillToLibrary, addSkillDirToLibrary, getSkillContent, skillExists } from '@/lib/library'
import { computeSkillHash } from '@/lib/skill-hash'
import { getSkillPath } from '@/lib/paths'
import { SKILL_FILE } from '@/constants'
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

const resolveSkillName = (inputPath: string, isDirectory: boolean, providedName?: string): string => {
  if (providedName) {
    const validation = validateSkillName(providedName)
    if (validation.valid) return validation.name
    fail(`Invalid skill name: ${validation.error}`)
  }

  if (isDirectory) {
    const dirName = basename(inputPath)
    const validation = validateSkillName(dirName)
    if (validation.valid) return validation.name
    p.log.error(pc.red(`Cannot use directory name '${dirName}' as skill name: ${validation.error}`))
    p.log.info(pc.dim('Use --name <name> to specify a valid skill name'))
    process.exit(1)
  }

  const extracted = extractSkillName(inputPath)
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

const confirmOverwrite = async (skillName: string, force: boolean): Promise<boolean> => {
  if (force) return true

  const shouldOverwrite = await p.confirm({
    message: `Skill '${skillName}' already exists. Overwrite?`,
    initialValue: false,
  })

  if (p.isCancel(shouldOverwrite) || !shouldOverwrite) {
    p.log.info(pc.dim('Cancelled'))
    process.exit(0)
  }

  return true
}

const logResult = (result: { success: true; action: string; commitHash?: string; path: string; warning?: string }, skillName: string) => {
  const actionVerb = result.action === 'added' ? 'Added' : result.action === 'updated' ? 'Updated' : 'Skipped'
  const commitInfo = result.commitHash ? pc.dim(` (commit: ${result.commitHash})`) : ''

  if (result.action === 'skipped') {
    p.log.info(pc.cyan(`Skill '${skillName}' already up to date, skipped`))
    return
  }

  p.log.success(`${actionVerb} skill '${pc.bold(skillName)}'${commitInfo}`)
  p.log.info(pc.dim(`Path: ${result.path}`))

  if (result.warning) {
    p.log.warn(pc.yellow(result.warning))
  }
}

const runDirAdd = async (dirPath: string, providedName: string | undefined, force: boolean) => {
  const resolvedPath = resolve(dirPath)

  if (!existsSync(resolvedPath)) {
    fail(`Directory not found: ${dirPath}`)
  }

  if (!existsSync(join(resolvedPath, SKILL_FILE))) {
    fail(`Directory must contain ${SKILL_FILE}: ${dirPath}`)
  }

  const skillName = resolveSkillName(resolvedPath, true, providedName)

  if (skillExists(skillName)) {
    const sourceHash = await computeSkillHash(resolvedPath)
    const existingHash = await computeSkillHash(getSkillPath(skillName))

    if (sourceHash === existingHash) {
      p.log.info(pc.cyan(`Skill '${skillName}' already up to date, skipped`))
      return
    }

    await confirmOverwrite(skillName, force)
  }

  const result = await addSkillDirToLibrary(skillName, resolvedPath)

  if (result.success) {
    logResult(result, skillName)
    return
  }

  fail(`Failed to add skill: ${result.error}`)
}

const runFileAdd = async (filePath: string, providedName: string | undefined, force: boolean) => {
  const resolvedPath = resolve(filePath)

  if (!existsSync(resolvedPath)) {
    fail(`File not found: ${filePath}`)
  }

  if (!resolvedPath.endsWith('.md')) {
    fail('Skill file must be a .md file')
  }

  const skillName = resolveSkillName(resolvedPath, false, providedName)
  const content = readFileSafe(resolvedPath)

  const existingContent = getSkillContent(skillName)
  if (existingContent !== null) {
    if (existingContent === content) {
      p.log.info(pc.cyan(`Skill '${skillName}' already up to date, skipped`))
      return
    }

    await confirmOverwrite(skillName, force)
  }

  const result = await addSkillToLibrary(skillName, content)

  if (result.success) {
    logResult(result, skillName)
    return
  }

  fail(`Failed to add skill: ${result.error}`)
}

export default defineCommand({
  meta: {
    name: 'add',
    description: 'Add a skill to the library (file or directory)',
  },
  args: {
    path: {
      type: 'positional',
      description: 'Path to a skill file (.md) or skill directory (containing SKILL.md)',
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
      p.log.info(pc.dim('  <path> can be a .md file or a directory containing SKILL.md'))
      p.log.info(pc.dim('For bulk operations, use: skillbook scan'))
      process.exit(1)
    }

    const resolvedPath = resolve(inputPath)
    const isDirectory = existsSync(resolvedPath) && lstatSync(resolvedPath).isDirectory()

    if (isDirectory) {
      await runDirAdd(inputPath, providedName, force)
    } else {
      await runFileAdd(inputPath, providedName, force)
    }
  },
})
