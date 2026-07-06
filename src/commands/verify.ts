import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import pc from 'picocolors'

import { verifyProject, type VerifyFinding, type VerifyFindingKind } from '@/lib/verify'

const formatSubject = (finding: VerifyFinding): string => {
  if (finding.skill) return `skill ${pc.bold(finding.skill)}`
  if (finding.harness) return `harness ${pc.bold(finding.harness)}`
  return 'lockfile'
}

const findingLabels: Record<VerifyFindingKind, string> = {
  'lockfile-error': 'lockfile-error',
  'hash-mismatch': 'hash-mismatch',
  'missing-skill': 'missing-skill',
  'unlocked-skill': 'unlocked-skill',
  'skill-read-error': 'skill-read-error',
  'harness-drifted': 'harness-drifted',
  'harness-missing': 'harness-missing',
  'harness-conflict': 'harness-conflict',
  'harness-stale': 'harness-stale',
  'library-lockfile-error': 'library-lockfile-error',
  'library-hash-mismatch': 'library-hash-mismatch',
  'library-missing-skill': 'library-missing-skill',
  'library-skill-read-error': 'library-skill-read-error',
}

const plural = (count: number, singular: string, pluralForm = `${singular}s`) =>
  `${count} ${count === 1 ? singular : pluralForm}`

export default defineCommand({
  meta: {
    name: 'verify',
    description: 'Read-only integrity check for project skill state',
  },
  args: {
    project: {
      type: 'string',
      description: 'Project path (defaults to current directory)',
    },
    library: {
      type: 'boolean',
      description: 'Also verify library lock entries against library content',
      default: false,
    },
    json: {
      type: 'boolean',
      description: 'Output machine-readable JSON',
      default: false,
    },
  },
  run: async ({ args }) => {
    const result = await verifyProject(args.project ?? process.cwd(), {
      library: args.library,
    })

    if (args.json) {
      process.stdout.write(JSON.stringify(result))
      if (!result.ok) process.exit(1)
      return
    }

    if (result.ok) {
      p.log.success(
        pc.green(
          `verified: ${plural(result.skills, 'skill')} and ${plural(result.harnesses, 'harness', 'harnesses')} clean`,
        ),
      )
      return
    }

    for (const finding of result.findings) {
      p.log.warn(
        pc.yellow(
          `${formatSubject(finding)} ${findingLabels[finding.kind]}: ${finding.detail}`,
        ),
      )
    }

    p.log.info(
      pc.dim(
        `Summary: ${result.findings.length} finding${result.findings.length === 1 ? '' : 's'} across ${plural(result.skills, 'skill')} and ${plural(result.harnesses, 'harness', 'harnesses')}.`,
      ),
    )
    process.exit(1)
  },
})
