import * as p from '@clack/prompts'
import pc from 'picocolors'

export const fail = (message: string, exitCode = 1): never => {
  p.log.error(pc.red(message))
  process.exit(exitCode)
}

export const getAllSkillArgs = (firstSkill: string): string[] => {
  const subcommandIndex = process.argv.findIndex(
    (arg) => arg === 'install' || arg === 'pull' || arg === 'push' || arg === 'uninstall',
  )

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

    if (arg.startsWith('--')) {
      if (flagsWithValues.has(arg)) {
        skipNext = true
      }
      continue
    }

    if (arg !== firstSkill) {
      skillArgs.push(arg)
    }
  }

  return [firstSkill, ...skillArgs]
}
