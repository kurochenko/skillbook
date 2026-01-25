import { Box, Text } from 'ink'
import { TOOLS } from '../../constants.js'
import type {
  InstalledSkill,
  UntrackedSkill,
  AvailableSkill,
  HarnessSkillInfo,
  UntrackedHarnessInfo,
} from '../../lib/project.js'

// A row in the skill list - can be a skill or a harness entry under a skill
export type SkillRow =
  | { type: 'installed-skill'; skill: InstalledSkill }
  | { type: 'installed-harness'; skill: InstalledSkill; harness: HarnessSkillInfo }
  | { type: 'untracked-skill'; skill: UntrackedSkill }
  | { type: 'untracked-harness'; skill: UntrackedSkill; harness: UntrackedHarnessInfo }
  | { type: 'available-skill'; skill: AvailableSkill }

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
const HarnessStatusBadge = ({ status }: { status: 'ok' | 'detached' | 'conflict' }) => {
  if (status === 'ok') {
    return <Text color="green">[✓]</Text>
  }
  if (status === 'detached') {
    return <Text dimColor>[detached]</Text>
  }
  return <Text color="red">[conflict]</Text>
}

// Render a single row
export const RowDisplay = ({ row, selected }: { row: SkillRow; selected: boolean }) => {
  const cursor = selected ? '>' : ' '
  const color = selected ? 'blue' : undefined
  const bold = selected

  switch (row.type) {
    case 'installed-skill': {
      const { name, isUnanimous, status, diff } = row.skill
      // Build badge text inline to avoid Ink rendering issues with embedded components
      let badgeText = ''
      let badgeColor: string | undefined
      if (isUnanimous) {
        if (status === 'ok') {
          badgeText = '[✓]'
          badgeColor = 'green'
        } else if (status === 'ahead') {
          badgeText = diff ? `[ahead +${diff.additions}/-${diff.deletions}]` : '[ahead]'
          badgeColor = 'yellow'
        } else if (status === 'behind') {
          badgeText = '[behind]'
          badgeColor = 'cyan'
        } else if (status === 'detached') {
          badgeText = '[detached]'
          badgeColor = 'gray'
        } else if (status === 'conflict') {
          badgeText = diff ? `[conflict +${diff.additions}/-${diff.deletions}]` : '[conflict]'
          badgeColor = 'red'
        }
      }
      return (
        <Box>
          <Text color={color} bold={bold}>{cursor} </Text>
          {badgeText && <Text color={badgeColor}>{badgeText}</Text>}
          {badgeText && <Text> </Text>}
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
