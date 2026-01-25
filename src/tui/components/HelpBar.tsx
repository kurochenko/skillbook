import { Box, Text } from 'ink'
import type { SkillRow } from './SkillRow'
import type { HarnessInfo } from '../../lib/harness.js'

export type Tab = 'skills' | 'harnesses'

type HelpBarProps = {
  tab: Tab
  selectedRow: SkillRow | null
  selectedHarness: HarnessInfo | null
}

export const HelpBar = ({ tab, selectedRow, selectedHarness }: HelpBarProps) => {
  if (tab === 'skills') {
    const parts: string[] = []

    if (!selectedRow) {
      // No selection
    } else if (selectedRow.type === 'available-skill') {
      parts.push('[i]nstall')
    } else if (selectedRow.type === 'installed-skill') {
      const { status, isUnanimous } = selectedRow.skill
      if (isUnanimous) {
        // Skill-level actions for unanimous state
        if (status === 'ok') {
          parts.push('[u]ninstall')
        } else if (status === 'ahead') {
          parts.push('[p]ush', '[u]ninstall')
        } else if (status === 'behind') {
          parts.push('[s]ync', '[u]ninstall')
        } else if (status === 'detached') {
          parts.push('[s]ync', '[u]ninstall')
        } else if (status === 'conflict') {
          parts.push('[s]ync (use library)', '[p]ush (use local)', '[u]ninstall')
        }
      } else {
        // Mixed state - can still uninstall at skill level
        parts.push('[u]ninstall')
      }
    } else if (selectedRow.type === 'installed-harness') {
      // Harness entry actions - available for all statuses
      parts.push('[s] use as source')
    } else if (selectedRow.type === 'untracked-skill') {
      parts.push('[p]ush to library')
    } else if (selectedRow.type === 'untracked-harness') {
      parts.push('[s] use as source')
    }

    parts.push('[tab] harnesses', '[q]uit')

    return (
      <Box borderStyle="single" borderColor="gray" paddingX={1} flexDirection="row">
        <Text dimColor wrap="truncate">{parts.join('  ')}</Text>
      </Box>
    )
  }

  // Harness tab help bar - context-sensitive based on harness state
  const harnessParts: string[] = []
  if (selectedHarness) {
    const { state } = selectedHarness
    if (state === 'enabled') {
      harnessParts.push('[d]etach', '[r]emove')
    } else if (state === 'detached') {
      harnessParts.push('[e]nable', '[r]emove')
    } else if (state === 'partial') {
      harnessParts.push('[e]nable', '[d]etach')
    } else {
      // available
      harnessParts.push('[e]nable')
    }
  }
  harnessParts.push('[tab] skills', '[q]uit')

  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1} flexDirection="row">
      <Text dimColor wrap="truncate">{harnessParts.join('  ')}</Text>
    </Box>
  )
}
