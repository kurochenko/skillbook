import * as p from '@clack/prompts'
import pc from 'picocolors'

export const fail = (message: string, exitCode = 1): never => {
  p.log.error(pc.red(message))
  process.exit(exitCode)
}
