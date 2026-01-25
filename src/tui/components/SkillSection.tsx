import { Box, Text } from 'ink'
import { RowDisplay, type SkillRow } from '@/tui/components/SkillRow'

type SkillSectionProps = {
  label: string
  count: number
  rows: SkillRow[]
  selectedIndex: number
  startIndex: number
  marginTop?: boolean
}

/**
 * Renders a section of skills with a header label and count.
 * Handles selection highlighting based on global selectedIndex.
 */
export const SkillSection = ({
  label,
  count,
  rows,
  selectedIndex,
  startIndex,
  marginTop = false,
}: SkillSectionProps) => {
  if (rows.length === 0) return null

  const getRowKey = (row: SkillRow): string => {
    switch (row.type) {
      case 'installed-skill':
        return `skill-${row.skill.name}`
      case 'installed-harness':
        return `harness-${row.skill.name}-${row.harness.harnessId}`
      case 'untracked-skill':
        return `local-${row.skill.name}`
      case 'untracked-harness':
        return `local-harness-${row.skill.name}-${row.harness.harnessId}`
      case 'available-skill':
        return `available-${row.skill.name}`
    }
  }

  return (
    <>
      <Box marginTop={marginTop ? 1 : 0}>
        <Text bold dimColor>{label} ({count})</Text>
      </Box>
      {rows.map((row, i) => (
        <RowDisplay
          key={getRowKey(row)}
          row={row}
          selected={selectedIndex === startIndex + i}
        />
      ))}
    </>
  )
}
