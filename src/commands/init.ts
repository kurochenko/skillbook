import { defineCommand } from 'citty'
import { existsSync, mkdirSync, symlinkSync, lstatSync, readlinkSync, unlinkSync } from 'fs'
import { join, dirname, relative } from 'path'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { listSkills } from '../lib/library.ts'
import { getSkillPath } from '../lib/paths.ts'
import { TOOLS, SUPPORTED_TOOLS, SKILL_FILE, type ToolId } from '../constants.ts'

type SymlinkResult = {
  skill: string
  tool: ToolId
  path: string
  status: 'created' | 'updated' | 'exists' | 'failed'
  error?: string
}

const getToolPath = (tool: ToolId, skillName: string): string => {
  return TOOLS[tool].skillPath(skillName)
}

const createSymlink = (skillName: string, tool: ToolId, projectDir: string): SymlinkResult => {
  const toolPath = getToolPath(tool, skillName)
  const fullPath = join(projectDir, toolPath)
  const librarySkillPath = join(getSkillPath(skillName), SKILL_FILE)

  // Compute relative path from symlink location to library
  const symlinkDir = dirname(fullPath)
  const relativePath = relative(symlinkDir, librarySkillPath)

  try {
    // Ensure parent directory exists
    mkdirSync(symlinkDir, { recursive: true })

    // Check if file/symlink already exists
    if (existsSync(fullPath) || lstatSync(fullPath).isSymbolicLink()) {
      const stats = lstatSync(fullPath)
      
      if (stats.isSymbolicLink()) {
        const currentTarget = readlinkSync(fullPath)
        if (currentTarget === relativePath) {
          return { skill: skillName, tool, path: toolPath, status: 'exists' }
        }
        // Update symlink to new target
        unlinkSync(fullPath)
        symlinkSync(relativePath, fullPath)
        return { skill: skillName, tool, path: toolPath, status: 'updated' }
      }
      
      // Regular file exists - don't overwrite
      return {
        skill: skillName,
        tool,
        path: toolPath,
        status: 'failed',
        error: 'File already exists (not a symlink)',
      }
    }
  } catch (e) {
    // File doesn't exist, which is fine - we'll create it
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      return {
        skill: skillName,
        tool,
        path: toolPath,
        status: 'failed',
        error: e instanceof Error ? e.message : 'Unknown error',
      }
    }
  }

  try {
    symlinkSync(relativePath, fullPath)
    return { skill: skillName, tool, path: toolPath, status: 'created' }
  } catch (error) {
    return {
      skill: skillName,
      tool,
      path: toolPath,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

const printResults = (results: SymlinkResult[]) => {
  const created = results.filter((r) => r.status === 'created')
  const updated = results.filter((r) => r.status === 'updated')
  const exists = results.filter((r) => r.status === 'exists')
  const failed = results.filter((r) => r.status === 'failed')

  if (created.length > 0) {
    console.log('')
    p.log.success(`Created ${created.length} symlink${created.length === 1 ? '' : 's'}:`)
    for (const r of created) {
      console.log(`  ${pc.green('+')} ${r.path}`)
    }
  }

  if (updated.length > 0) {
    console.log('')
    p.log.info(`Updated ${updated.length} symlink${updated.length === 1 ? '' : 's'}:`)
    for (const r of updated) {
      console.log(`  ${pc.yellow('~')} ${r.path}`)
    }
  }

  if (exists.length > 0) {
    console.log('')
    p.log.info(pc.dim(`${exists.length} already up to date`))
  }

  if (failed.length > 0) {
    console.log('')
    p.log.error(`Failed to create ${failed.length} symlink${failed.length === 1 ? '' : 's'}:`)
    for (const r of failed) {
      console.log(`  ${pc.red('✗')} ${r.path}: ${r.error}`)
    }
  }

  const summary = []
  if (created.length > 0) summary.push(pc.green(`${created.length} created`))
  if (updated.length > 0) summary.push(pc.yellow(`${updated.length} updated`))
  if (exists.length > 0) summary.push(pc.dim(`${exists.length} unchanged`))
  if (failed.length > 0) summary.push(pc.red(`${failed.length} failed`))

  p.outro(summary.join(', '))
}

export default defineCommand({
  meta: {
    name: 'init',
    description: 'Initialize skills in the current project',
  },
  args: {
    dir: {
      type: 'string',
      alias: 'd',
      description: 'Project directory (defaults to current directory)',
    },
    skill: {
      type: 'string',
      alias: 's',
      description: 'Skill(s) to initialize (comma-separated, for non-interactive use)',
    },
    tool: {
      type: 'string',
      alias: 't',
      description: 'Tool(s) to configure (comma-separated: claude-code,cursor,opencode)',
    },
  },
  run: async ({ args }) => {
    const projectDir = args.dir ?? process.cwd()
    const skillArg = args.skill
    const toolArg = args.tool

    // Non-interactive mode when both --skill and --tool are provided
    if (skillArg && toolArg) {
      const skillNames = skillArg.split(',').map((s) => s.trim())
      const toolIds = toolArg.split(',').map((t) => t.trim()) as ToolId[]

      const availableSkills = new Set(listSkills())
      const invalidSkills = skillNames.filter((s) => !availableSkills.has(s))
      if (invalidSkills.length > 0) {
        p.log.error(pc.red(`Unknown skill(s): ${invalidSkills.join(', ')}`))
        p.log.info(pc.dim(`Available: ${[...availableSkills].join(', ')}`))
        process.exit(1)
      }

      const invalidTools = toolIds.filter((t) => !SUPPORTED_TOOLS.includes(t))
      if (invalidTools.length > 0) {
        p.log.error(pc.red(`Unknown tool(s): ${invalidTools.join(', ')}`))
        p.log.info(pc.dim(`Available: ${SUPPORTED_TOOLS.join(', ')}`))
        process.exit(1)
      }

      const results: SymlinkResult[] = []
      for (const skill of skillNames) {
        for (const tool of toolIds) {
          results.push(createSymlink(skill, tool, projectDir))
        }
      }

      printResults(results)
      return
    }

    // Interactive mode
    p.intro(pc.cyan('Initialize skills in project'))

    const availableSkills = listSkills()

    if (availableSkills.length === 0) {
      p.log.warn('No skills in the library')
      p.log.info(pc.dim('Run `skillbook add` to add skills first'))
      p.outro(pc.dim('Cancelled'))
      return
    }

    const selectedSkills = await p.multiselect({
      message: 'Select skills to initialize:',
      options: availableSkills.map((name) => ({
        value: name,
        label: name,
      })),
      required: false,
    })

    if (p.isCancel(selectedSkills) || selectedSkills.length === 0) {
      p.outro(pc.dim('Cancelled'))
      return
    }

    const selectedTools = await p.multiselect({
      message: 'Select tools to configure:',
      options: SUPPORTED_TOOLS.map((id) => ({
        value: id,
        label: TOOLS[id].name,
      })),
      required: false,
    })

    if (p.isCancel(selectedTools) || selectedTools.length === 0) {
      p.outro(pc.dim('Cancelled'))
      return
    }

    const results: SymlinkResult[] = []

    for (const skill of selectedSkills as string[]) {
      for (const tool of selectedTools as ToolId[]) {
        results.push(createSymlink(skill, tool, projectDir))
      }
    }

    printResults(results)
  },
})
