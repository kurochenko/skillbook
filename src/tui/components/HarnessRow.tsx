import { Box, Text } from 'ink'
import type { HarnessInfo, HarnessState } from '@/lib/harness'

const HARNESS_STATE_BADGE: Record<HarnessState, { text: string; color?: string; dim?: boolean }> = {
  enabled: { text: '[✓]', color: 'green' },
  detached: { text: '[d]', dim: true },
  partial: { text: '[~]', color: 'yellow' },
  available: { text: '[ ]', dim: true },
}

const HarnessStateBadge = ({ state }: { state: HarnessState }) => {
  const badge = HARNESS_STATE_BADGE[state]
  return <Text color={badge.color} dimColor={badge.dim}>{badge.text}</Text>
}

export const HarnessRow = ({
  harness,
  selected,
}: {
  harness: HarnessInfo
  selected: boolean
}) => {
  return (
    <Box>
      <Text color={selected ? 'blue' : undefined} bold={selected}>{selected ? '>' : ' '} </Text>
      <HarnessStateBadge state={harness.state} />
      <Text color={selected ? 'blue' : undefined} bold={selected}> {harness.name}</Text>
    </Box>
  )
}
