import * as p from '@clack/prompts'
import pc from 'picocolors'

export const fail = (message: string, exitCode = 1): never => {
  p.log.error(pc.red(message))
  process.exit(exitCode)
}

export const getAllSkillArgs = (commandName: string, firstSkill: string): string[] => {
  if (!firstSkill) {
    return []
  }

  const subcommandIndex = process.argv.findIndex((arg) => arg === commandName)

  if (subcommandIndex === -1) {
    return [firstSkill]
  }

  const remainingArgs = process.argv.slice(subcommandIndex + 1)
  const flagsWithValues = new Set(['--project'])

  const skillArgs: string[] = []
  let skipNext = false

  for (const arg of remainingArgs) {
    if (skipNext) {
      skipNext = false
      continue
    }

    if (arg.startsWith('-')) {
      if (arg.includes('=')) {
        continue
      }

      if (flagsWithValues.has(arg)) {
        skipNext = true
      }

      continue
    }

    if (arg !== firstSkill) {
      skillArgs.push(arg)
    }
  }

  const allSkills = [firstSkill, ...skillArgs]
  return [...new Set(allSkills)].filter((s) => s.length > 0)
}
