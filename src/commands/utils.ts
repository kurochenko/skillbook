import pc from 'picocolors'
import { validateExistingSkillName } from '@/lib/skills'

export { readLockFileOrFail } from '@/lib/lock-read'

type FailOptions = {
  json?: boolean
  payload?: Record<string, unknown>
}

export const fail = (message: string, exitCode = 1, options: FailOptions = {}): never => {
  if (options.json) {
    process.stdout.write(JSON.stringify({ ...options.payload, ok: false, error: message }))
    process.exit(exitCode)
  }

  process.stderr.write(`${pc.red(message)}\n`)
  process.exit(exitCode)
}

export const plural = (count: number, singular: string, pluralForm = `${singular}s`) =>
  `${count} ${count === 1 ? singular : pluralForm}`

export const resolveSkills = (skill?: string, skills?: string): string[] => {
  const skillList: string[] = []
  if (skill) {
    const trimmedSkill = skill.trim()
    if (trimmedSkill) skillList.push(trimmedSkill)
  }
  if (skills) {
    skillList.push(...skills.split(',').map(s => s.trim()).filter(Boolean))
  }
  const uniqueSkills = [...new Set(skillList)]
  if (uniqueSkills.length === 0) {
    process.stderr.write(pc.red('No skills specified\n'))
    process.exit(1)
  }
  for (const s of uniqueSkills) {
    const validation = validateExistingSkillName(s)
    if (!validation.valid) {
      process.stderr.write(pc.red(`Invalid skill name "${s}": ${validation.error}\n`))
      process.exit(1)
    }
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
