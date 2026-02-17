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
  const duplicates: string[] = []
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

    if (arg === firstSkill) {
      duplicates.push(arg)
    } else {
      skillArgs.push(arg)
    }
  }

  for (const dup of [...new Set(duplicates)]) {
    process.stderr.write(pc.yellow(`Warning: duplicate skill name ignored: ${dup}\n`))
  }

  return [firstSkill, ...skillArgs]
}
