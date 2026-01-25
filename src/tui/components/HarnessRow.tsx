import { Box, Text } from 'ink'
import type { HarnessInfo, HarnessState } from '@/lib/harness'

// Harness state badge
const HarnessStateBadge = ({ state }: { state: HarnessState }) => {
  if (state === 'enabled') {
    return <Text color="green">[✓]</Text>
  }
  if (state === 'detached') {
    return <Text dimColor>[d]</Text>
  }
  if (state === 'partial') {
    return <Text color="yellow">[~]</Text>
  }
  return <Text dimColor>[ ]</Text>
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
