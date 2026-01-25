import { Box, Text } from 'ink'
import type { SkillRow } from '@/tui/components/SkillRow'
import type { HarnessInfo, HarnessState } from '@/lib/harness'
import type { SkillSyncStatus } from '@/lib/project-scan'

export type Tab = 'skills' | 'harnesses'

type HelpBarProps = {
  tab: Tab
  selectedRow: SkillRow | null
  selectedHarness: HarnessInfo | null
}

const SKILL_STATUS_ACTIONS: Record<SkillSyncStatus, string[]> = {
  ok: ['[u]ninstall'],
  ahead: ['[p]ush', '[u]ninstall'],
  behind: ['[s]ync', '[u]ninstall'],
  detached: ['[s]ync', '[u]ninstall'],
  conflict: ['[s]ync (use library)', '[p]ush (use local)', '[u]ninstall'],
}

const HARNESS_STATE_ACTIONS: Record<HarnessState, string[]> = {
  enabled: ['[d]etach', '[r]emove'],
  detached: ['[e]nable', '[r]emove'],
  partial: ['[e]nable', '[d]etach'],
  available: ['[e]nable'],
}

const getSkillRowActions = (row: SkillRow | null): string[] => {
  if (!row) return []

  switch (row.type) {
    case 'available-skill':
      return ['[i]nstall']
    case 'installed-skill':
      return row.skill.isUnanimous
        ? SKILL_STATUS_ACTIONS[row.skill.status]
        : ['[u]ninstall']
    case 'installed-harness':
    case 'untracked-harness':
      return ['[s] use as source']
    case 'untracked-skill':
      return ['[p]ush to library']
  }
}

export const HelpBar = ({ tab, selectedRow, selectedHarness }: HelpBarProps) => {
  const isSkillsTab = tab === 'skills'

  const actions = isSkillsTab
    ? getSkillRowActions(selectedRow)
    : selectedHarness ? HARNESS_STATE_ACTIONS[selectedHarness.state] : []

  const navigation = isSkillsTab ? '[tab] harnesses' : '[tab] skills'
  const parts = [...actions, navigation, '[q]uit']

  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1} flexDirection="row">
      <Text dimColor wrap="truncate">{parts.join('  ')}</Text>
    </Box>
  )
}
