import { useState, useEffect, useCallback } from 'react'
import { render, Box, Text, useInput, useApp } from 'ink'
import {
  getInstalledSkills,
  getUntrackedSkills,
  getAvailableSkills,
  installSkill,
  uninstallSkill,
  pushSkillToLibrary,
  syncSkillFromLibrary,
  type InstalledSkill,
  type UntrackedSkill,
  type AvailableSkill,
} from '../lib/project.js'
import {
  getHarnessesInfo,
  syncAllSkillsToHarness,
  removeAllSkillsFromHarness,
  type HarnessInfo,
} from '../lib/harness.js'
import { setHarnessEnabled } from '../lib/config.js'
import type { ToolId } from '../constants.js'

type Tab = 'skills' | 'harnesses'

type SkillItem =
  | { type: 'installed'; skill: InstalledSkill }
  | { type: 'untracked'; skill: UntrackedSkill }
  | { type: 'available'; skill: AvailableSkill }

const StatusBadge = ({ item }: { item: SkillItem }) => {
  switch (item.type) {
    case 'installed': {
      const { status, diff } = item.skill
      if (status === 'synced') {
        return <Text color="green">[synced]</Text>
      }
      if (status === 'ahead' && diff) {
        return <Text color="yellow">[ahead +{diff.additions}/-{diff.deletions}]</Text>
      }
      if (status === 'ahead') {
        return <Text color="yellow">[ahead]</Text>
      }
      if (status === 'behind') {
        return <Text color="cyan">[behind]</Text>
      }
      return <Text color="red">[diverged]</Text>
    }
    case 'untracked':
      return <Text dimColor>[untracked]</Text>
    case 'available':
      return <Text dimColor>[available]</Text>
  }
}

const SkillRow = ({
  item,
  selected,
}: {
  item: SkillItem
  selected: boolean
}) => {
  const name = item.type === 'installed' ? item.skill.name :
               item.type === 'untracked' ? item.skill.name :
               item.skill.name

  return (
    <Box>
      <Text color={selected ? 'blue' : undefined} bold={selected}>
        {selected ? '>' : ' '} <StatusBadge item={item} /> {name}
      </Text>
    </Box>
  )
}

const HarnessRow = ({
  harness,
  selected,
}: {
  harness: HarnessInfo
  selected: boolean
}) => {
  return (
    <Box>
      <Text color={selected ? 'blue' : undefined} bold={selected}>
        {selected ? '>' : ' '} [{harness.enabled ? 'x' : ' '}] {harness.name}
        {harness.exists && !harness.enabled && <Text dimColor> (folder exists)</Text>}
      </Text>
    </Box>
  )
}

const HelpBar = ({ tab, selectedItem }: { tab: Tab; selectedItem: SkillItem | null }) => {
  if (tab === 'skills') {
    const parts: string[] = []

    if (selectedItem?.type === 'available') {
      parts.push('[i]nstall')
    } else if (selectedItem?.type === 'installed') {
      parts.push('[u]ninstall', '[s]ync', '[p]ush')
    } else if (selectedItem?.type === 'untracked') {
      parts.push('[p]ush')
    }

    parts.push('[tab] harnesses', '[q]uit')

    return (
      <Box borderStyle="single" borderColor="gray" paddingX={1} flexDirection="row">
        <Text dimColor wrap="truncate">{parts.join('  ')}</Text>
      </Box>
    )
  }
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1} flexDirection="row">
      <Text dimColor wrap="truncate">[space] toggle  [tab] skills  [q]uit</Text>
    </Box>
  )
}

type AppProps = {
  projectPath: string
  inProject: boolean
}

const App = ({ projectPath, inProject }: AppProps) => {
  const { exit } = useApp()
  const [tab, setTab] = useState<Tab>('skills')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [message, setMessage] = useState<string | null>(null)

  // Skill state
  const [installedSkills, setInstalledSkills] = useState<InstalledSkill[]>([])
  const [untrackedSkills, setUntrackedSkills] = useState<UntrackedSkill[]>([])
  const [availableSkills, setAvailableSkills] = useState<AvailableSkill[]>([])

  // Harness state
  const [harnesses, setHarnesses] = useState<HarnessInfo[]>([])

  // Load data
  const loadData = useCallback(() => {
    setInstalledSkills(getInstalledSkills(projectPath))
    setUntrackedSkills(getUntrackedSkills(projectPath))
    setAvailableSkills(getAvailableSkills(projectPath))
    setHarnesses(getHarnessesInfo(projectPath))
  }, [projectPath])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Build combined skill list
  const skillItems: SkillItem[] = [
    ...installedSkills.map((skill): SkillItem => ({ type: 'installed', skill })),
    ...untrackedSkills.map((skill): SkillItem => ({ type: 'untracked', skill })),
    ...availableSkills.map((skill): SkillItem => ({ type: 'available', skill })),
  ]

  const currentList = tab === 'skills' ? skillItems : harnesses
  const selectedItem = tab === 'skills' ? (skillItems[selectedIndex] ?? null) : null

  // Show temporary message
  const showMessage = (msg: string) => {
    setMessage(msg)
    setTimeout(() => setMessage(null), 2000)
  }

  useInput((input, key) => {
    // Navigation
    if (key.upArrow || input === 'k') {
      setSelectedIndex((i) => Math.max(0, i - 1))
    }
    if (key.downArrow || input === 'j') {
      setSelectedIndex((i) => Math.min(currentList.length - 1, i + 1))
    }

    // Tab switching
    if (key.tab) {
      setTab((t) => (t === 'skills' ? 'harnesses' : 'skills'))
      setSelectedIndex(0)
    }

    // Quit
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit()
    }

    // Actions for skills tab
    if (tab === 'skills' && selectedItem) {
      // Install
      if (input === 'i' && selectedItem.type === 'available') {
        const success = installSkill(projectPath, selectedItem.skill.name)
        if (success) {
          showMessage(`Installed: ${selectedItem.skill.name}`)
          loadData()
        } else {
          showMessage(`Failed to install: ${selectedItem.skill.name}`)
        }
      }

      // Uninstall
      if (input === 'u' && selectedItem.type === 'installed') {
        const success = uninstallSkill(projectPath, selectedItem.skill.name)
        if (success) {
          showMessage(`Uninstalled: ${selectedItem.skill.name}`)
          loadData()
        } else {
          showMessage(`Failed to uninstall: ${selectedItem.skill.name}`)
        }
      }

      // Push
      if (input === 'p' && (selectedItem.type === 'installed' || selectedItem.type === 'untracked')) {
        const name = selectedItem.skill.name
        pushSkillToLibrary(projectPath, name).then((success) => {
          if (success) {
            showMessage(`Pushed to library: ${name}`)
            loadData()
          } else {
            showMessage(`Failed to push: ${name}`)
          }
        })
      }

      // Sync (pull from library)
      if (input === 's' && selectedItem.type === 'installed') {
        const success = syncSkillFromLibrary(projectPath, selectedItem.skill.name)
        if (success) {
          showMessage(`Synced: ${selectedItem.skill.name}`)
          loadData()
        } else {
          showMessage(`Failed to sync: ${selectedItem.skill.name}`)
        }
      }
    }

    // Actions for harnesses tab
    if (tab === 'harnesses') {
      if (input === ' ' || key.return) {
        const harness = harnesses[selectedIndex]
        if (harness) {
          const newEnabled = !harness.enabled
          setHarnessEnabled(projectPath, harness.id, newEnabled)

          // Sync or remove skills based on toggle
          if (newEnabled) {
            // Sync all installed skills to this harness
            const skills = installedSkills.map((s) => ({ name: s.name, content: s.content }))
            syncAllSkillsToHarness(projectPath, harness.id as ToolId, skills)
            showMessage(`Enabled: ${harness.name}`)
          } else {
            // Remove all skills from this harness
            removeAllSkillsFromHarness(
              projectPath,
              harness.id as ToolId,
              installedSkills.map((s) => s.name),
            )
            showMessage(`Disabled: ${harness.name}`)
          }

          loadData()
        }
      }
    }
  })

  // Section counts for display
  const installedCount = installedSkills.length
  const untrackedCount = untrackedSkills.length
  const availableCount = availableSkills.length

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          skillbook
        </Text>
        <Text dimColor> - {inProject ? 'Project Mode' : 'Library Mode'}</Text>
      </Box>

      {/* Message */}
      {message && (
        <Box marginBottom={1}>
          <Text color="green">{message}</Text>
        </Box>
      )}

      {/* Tabs */}
      <Box marginBottom={1} gap={2}>
        <Text
          bold={tab === 'skills'}
          color={tab === 'skills' ? 'blue' : undefined}
          underline={tab === 'skills'}
        >
          Skills
        </Text>
        <Text
          bold={tab === 'harnesses'}
          color={tab === 'harnesses' ? 'blue' : undefined}
          underline={tab === 'harnesses'}
        >
          Harnesses
        </Text>
      </Box>

      {/* Content */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="gray"
        paddingX={1}
        minHeight={10}
      >
        {tab === 'skills' ? (
          <>
            {installedCount > 0 && (
              <>
                <Text bold dimColor>
                  INSTALLED ({installedCount})
                </Text>
                {skillItems
                  .filter((item): item is { type: 'installed'; skill: InstalledSkill } =>
                    item.type === 'installed')
                  .map((item, i) => (
                    <SkillRow
                      key={`installed-${item.skill.name}`}
                      item={item}
                      selected={selectedIndex === i}
                    />
                  ))}
              </>
            )}
            {untrackedCount > 0 && (
              <>
                <Box marginTop={installedCount > 0 ? 1 : 0}>
                  <Text bold dimColor>
                    UNTRACKED ({untrackedCount})
                  </Text>
                </Box>
                {skillItems
                  .filter((item): item is { type: 'untracked'; skill: UntrackedSkill } =>
                    item.type === 'untracked')
                  .map((item, i) => (
                    <SkillRow
                      key={`untracked-${item.skill.name}`}
                      item={item}
                      selected={selectedIndex === installedCount + i}
                    />
                  ))}
              </>
            )}
            {availableCount > 0 && (
              <>
                <Box marginTop={installedCount > 0 || untrackedCount > 0 ? 1 : 0}>
                  <Text bold dimColor>
                    AVAILABLE ({availableCount})
                  </Text>
                </Box>
                {skillItems
                  .filter((item): item is { type: 'available'; skill: AvailableSkill } =>
                    item.type === 'available')
                  .map((item, i) => (
                    <SkillRow
                      key={`available-${item.skill.name}`}
                      item={item}
                      selected={selectedIndex === installedCount + untrackedCount + i}
                    />
                  ))}
              </>
            )}
            {skillItems.length === 0 && (
              <Text dimColor>No skills found. Run `skillbook scan` to discover skills.</Text>
            )}
          </>
        ) : (
          <>
            <Text bold dimColor>
              SELECT HARNESSES
            </Text>
            {harnesses.map((harness, i) => (
              <HarnessRow
                key={harness.id}
                harness={harness}
                selected={selectedIndex === i}
              />
            ))}
          </>
        )}
      </Box>

      {/* Help bar */}
      <Box marginTop={1}>
        <HelpBar tab={tab} selectedItem={selectedItem} />
      </Box>
    </Box>
  )
}

export const runTUI = (projectPath: string, inProject: boolean) => {
  render(<App projectPath={projectPath} inProject={inProject} />)
}

export default App
