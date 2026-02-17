import * as p from '@clack/prompts'
import pc from 'picocolors'

export const fail = (message: string, exitCode = 1): never => {
  p.log.error(pc.red(message))
  process.exit(exitCode)
}

export const resolveSkills = (skill?: string, skills?: string): string[] => {
  const skillList: string[] = []
  if (skill) skillList.push(skill)
  if (skills) {
    skillList.push(...skills.split(',').map(s => s.trim()).filter(Boolean))
  }
  const uniqueSkills = [...new Set(skillList)]
  if (uniqueSkills.length === 0) {
    process.stderr.write(pc.red('No skills specified\n'))
    process.exit(1)
  }
  const seen = new Set<string>()
  for (const s of skillList) {
    if (seen.has(s)) {
      process.stderr.write(pc.yellow(`Warning: duplicate skill name ignored: ${s}\n`))
    }
    seen.add(s)
  }
  return uniqueSkills
}
