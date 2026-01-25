import { Box, Text } from 'ink'
import { TOOLS } from '@/constants'
import type {
  InstalledSkill,
  UntrackedSkill,
  AvailableSkill,
  HarnessSkillInfo,
  UntrackedHarnessInfo,
  SkillSyncStatus,
  HarnessSkillStatus,
} from '@/lib/project-scan'
import type { DiffStats } from '@/lib/library'

// A row in the skill list - can be a skill or a harness entry under a skill
export type SkillRow =
  | { type: 'installed-skill'; skill: InstalledSkill }
  | { type: 'installed-harness'; skill: InstalledSkill; harness: HarnessSkillInfo }
  | { type: 'untracked-skill'; skill: UntrackedSkill }
  | { type: 'untracked-harness'; skill: UntrackedSkill; harness: UntrackedHarnessInfo }
  | { type: 'available-skill'; skill: AvailableSkill }

// Status badge configuration for skill-level statuses
type BadgeConfig = {
  text: string | ((diff: DiffStats | null) => string)
  color: string
}

const SKILL_STATUS_BADGE: Record<SkillSyncStatus, BadgeConfig> = {
  ok: { text: '[✓]', color: 'green' },
  ahead: {
    text: (diff) => diff ? `[ahead +${diff.additions}/-${diff.deletions}]` : '[ahead]',
    color: 'yellow',
  },
  behind: { text: '[behind]', color: 'cyan' },
  detached: { text: '[detached]', color: 'gray' },
  conflict: {
    text: (diff) => diff ? `[conflict +${diff.additions}/-${diff.deletions}]` : '[conflict]',
    color: 'red',
  },
}

// Status badge configuration for harness-level statuses
const HARNESS_STATUS_BADGE: Record<HarnessSkillStatus, { text: string; color?: string; dim?: boolean }> = {
  ok: { text: '[✓]', color: 'green' },
  detached: { text: '[detached]', dim: true },
  conflict: { text: '[conflict]', color: 'red' },
}

const getSkillBadge = (status: SkillSyncStatus, diff: DiffStats | null) => {
  const config = SKILL_STATUS_BADGE[status]
  const text = typeof config.text === 'function' ? config.text(diff) : config.text
  return { text, color: config.color }
}

// Build flat list of rows with tree structure
export const buildSkillRows = (
  installed: InstalledSkill[],
  untracked: UntrackedSkill[],
  available: AvailableSkill[],
): SkillRow[] => {
  const rows: SkillRow[] = []

  // Installed skills
  for (const skill of installed) {
    rows.push({ type: 'installed-skill', skill })
    // Show harness entries only when not unanimous
    if (!skill.isUnanimous) {
      for (const harness of skill.harnesses) {
        rows.push({ type: 'installed-harness', skill, harness })
      }
    }
  }

  // Untracked (LOCAL) skills
  for (const skill of untracked) {
    rows.push({ type: 'untracked-skill', skill })
    // Always show harness entries for untracked skills (shows where they exist)
    if (skill.harnesses.length > 0) {
      for (const harness of skill.harnesses) {
        rows.push({ type: 'untracked-harness', skill, harness })
      }
    }
  }

  // Available skills (no harness entries, just skills)
  for (const skill of available) {
    rows.push({ type: 'available-skill', skill })
  }

  return rows
}

// Status badge for harness entries
const HarnessStatusBadge = ({ status }: { status: HarnessSkillStatus }) => {
  const badge = HARNESS_STATUS_BADGE[status]
  return <Text color={badge.color} dimColor={badge.dim}>{badge.text}</Text>
}

// Render a single row
export const RowDisplay = ({ row, selected }: { row: SkillRow; selected: boolean }) => {
  const cursor = selected ? '>' : ' '
  const color = selected ? 'blue' : undefined
  const bold = selected

  switch (row.type) {
    case 'installed-skill': {
      const { name, isUnanimous, status, diff } = row.skill
      const badge = isUnanimous ? getSkillBadge(status, diff) : null
      return (
        <Box>
          <Text color={color} bold={bold}>{cursor} </Text>
          {badge && <Text color={badge.color}>{badge.text}</Text>}
          {badge && <Text> </Text>}
          <Text color={color} bold={bold}>{name}</Text>
        </Box>
      )
    }

    case 'installed-harness': {
      const harnessName = TOOLS[row.harness.harnessId].name
      const isLast = row.skill.harnesses.indexOf(row.harness) === row.skill.harnesses.length - 1
      const prefix = isLast ? '└─' : '├─'
      return (
        <Box>
          <Text color={color} bold={bold}>{cursor}   {prefix} {harnessName} </Text>
          <HarnessStatusBadge status={row.harness.status} />
        </Box>
      )
    }

    case 'untracked-skill':
      return (
        <Box>
          <Text color={color} bold={bold}>
            {cursor} {row.skill.name}
          </Text>
        </Box>
      )

    case 'untracked-harness': {
      const harnessName = TOOLS[row.harness.harnessId].name
      const isLast = row.skill.harnesses.indexOf(row.harness) === row.skill.harnesses.length - 1
      const prefix = isLast ? '└─' : '├─'
      return (
        <Box>
          <Text color={color} bold={bold}>
            {cursor}   {prefix} {harnessName}
          </Text>
        </Box>
      )
    }

    case 'available-skill':
      return (
        <Box>
          <Text color={color} bold={bold}>
            {cursor} {row.skill.name}
          </Text>
        </Box>
      )
  }
}
