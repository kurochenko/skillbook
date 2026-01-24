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
  type HarnessSkillInfo,
  type UntrackedHarnessInfo,
} from '../lib/project.js'
import {
  getHarnessesInfo,
  syncAllSkillsToHarness,
  removeAllSkillsFromHarness,
  type HarnessInfo,
} from '../lib/harness.js'
import { setHarnessEnabled } from '../lib/config.js'
import { TOOLS, type ToolId } from '../constants.js'

type Tab = 'skills' | 'harnesses'

// A row in the skill list - can be a skill or a harness entry under a skill
type SkillRow =
  | { type: 'installed-skill'; skill: InstalledSkill }
  | { type: 'installed-harness'; skill: InstalledSkill; harness: HarnessSkillInfo }
  | { type: 'untracked-skill'; skill: UntrackedSkill }
  | { type: 'untracked-harness'; skill: UntrackedSkill; harness: UntrackedHarnessInfo }
  | { type: 'available-skill'; skill: AvailableSkill }

// Build flat list of rows with tree structure
const buildSkillRows = (
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
const RowDisplay = ({ row, selected }: { row: SkillRow; selected: boolean }) => {
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

const HelpBar = ({ tab, selectedRow }: { tab: Tab; selectedRow: SkillRow | null }) => {
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
  const [confirmAction, setConfirmAction] = useState<{
    message: string
    onConfirm: () => void
  } | null>(null)

  // Skill state
  const [installedSkills, setInstalledSkills] = useState<InstalledSkill[]>([])
  const [untrackedSkills, setUntrackedSkills] = useState<UntrackedSkill[]>([])
  const [availableSkills, setAvailableSkills] = useState<AvailableSkill[]>([])

  // Harness state
  const [harnesses, setHarnesses] = useState<HarnessInfo[]>([])

  // Load data, optionally selecting a specific skill by name
  const loadData = useCallback((selectSkillName?: string) => {
    const installed = getInstalledSkills(projectPath)
    const untracked = getUntrackedSkills(projectPath)
    const available = getAvailableSkills(projectPath)

    setInstalledSkills(installed)
    setUntrackedSkills(untracked)
    setAvailableSkills(available)
    setHarnesses(getHarnessesInfo(projectPath))

    const newRows = buildSkillRows(installed, untracked, available)

    if (selectSkillName) {
      // Find the skill row and select it
      const skillIndex = newRows.findIndex(
        (r) =>
          (r.type === 'installed-skill' && r.skill.name === selectSkillName) ||
          (r.type === 'untracked-skill' && r.skill.name === selectSkillName)
      )
      if (skillIndex >= 0) {
        setSelectedIndex(skillIndex)
        return
      }
    }

    // Fallback: clamp to bounds
    setSelectedIndex((i) => Math.min(i, Math.max(0, newRows.length - 1)))
  }, [projectPath])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Build flat list of rows for navigation
  const skillRows = buildSkillRows(installedSkills, untrackedSkills, availableSkills)
  const currentList = tab === 'skills' ? skillRows : harnesses
  const selectedRow = tab === 'skills' ? (skillRows[selectedIndex] ?? null) : null

  // Count skills for section headers
  const installedCount = installedSkills.length
  const untrackedCount = untrackedSkills.length
  const availableCount = availableSkills.length



  useInput((input, key) => {
    // Handle confirmation dialog
    if (confirmAction) {
      if (input === 'y') {
        confirmAction.onConfirm()
        setConfirmAction(null)
      } else if (input === 'n' || key.escape) {
        setConfirmAction(null)
      }
      return
    }

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
    if (tab === 'skills' && selectedRow) {
      // Install (available skill)
      if (input === 'i' && selectedRow.type === 'available-skill') {
        const name = selectedRow.skill.name
        installSkill(projectPath, name).then(() => loadData())
      }

      // Uninstall (installed skill - at skill level)
      // Not destructive - skill stays in library, can reinstall anytime
      if (input === 'u' && selectedRow.type === 'installed-skill') {
        const name = selectedRow.skill.name
        uninstallSkill(projectPath, name).then(() => loadData())
      }

      // Push (installed skill or untracked skill - at skill level)
      if (input === 'p') {
        if (selectedRow.type === 'installed-skill') {
          const name = selectedRow.skill.name
          pushSkillToLibrary(projectPath, name).then(() => loadData(name))
        } else if (selectedRow.type === 'untracked-skill') {
          const name = selectedRow.skill.name
          pushSkillToLibrary(projectPath, name).then(() => loadData(name))
        }
      }

      // Sync (installed skill - at skill level, uses library version)
      if (input === 's' && selectedRow.type === 'installed-skill') {
        const name = selectedRow.skill.name
        const { status, isUnanimous } = selectedRow.skill
        if (isUnanimous && (status === 'detached' || status === 'behind')) {
          syncSkillFromLibrary(projectPath, name).then(() => loadData(name))
        } else if (isUnanimous && status === 'conflict') {
          setConfirmAction({
            message: `Sync "${name}"? This will overwrite local changes with library version.`,
            onConfirm: () => {
              syncSkillFromLibrary(projectPath, name).then(() => loadData(name))
            },
          })
        }
      }

      // Use as source (harness entry level)
      if (input === 's' && selectedRow.type === 'installed-harness') {
        const { skill, harness } = selectedRow
        const harnessName = TOOLS[harness.harnessId].name
        const skillName = skill.name

        if (harness.status === 'ok') {
          // Already symlinked - sync others to library
          // Only confirm if other harnesses have conflicts (would lose their changes)
          const hasConflicts = skill.harnesses.some(
            (h) => h.harnessId !== harness.harnessId && h.status === 'conflict'
          )
          if (hasConflicts) {
            setConfirmAction({
              message: `Sync other harnesses to ${harnessName} version of "${skillName}"?\nThis will overwrite conflicting changes in other harnesses.`,
              onConfirm: () => {
                syncSkillFromLibrary(projectPath, skillName).then(() => loadData(skillName))
              },
            })
          } else {
            // No conflicts - just sync (converts detached to symlinks)
            syncSkillFromLibrary(projectPath, skillName).then(() => loadData(skillName))
          }
        } else if (harness.status === 'detached') {
          // Detached - content matches library, just sync to convert to symlinks
          // Not destructive - no confirmation needed
          pushSkillToLibrary(projectPath, skillName).then(() => {
            syncSkillFromLibrary(projectPath, skillName).then(() => loadData(skillName))
          })
        } else {
          // Conflict - push this version to library (overwrites), then sync all
          // Destructive - needs confirmation
          setConfirmAction({
            message: `Use ${harnessName} version of "${skillName}" as source?\nThis will overwrite the library version and sync all harnesses.`,
            onConfirm: () => {
              pushSkillToLibrary(projectPath, skillName).then(() => {
                syncSkillFromLibrary(projectPath, skillName).then(() => loadData(skillName))
              })
            },
          })
        }
      }

      // Use as source (untracked harness entry level)
      // Not destructive - just adding new content to library
      if (input === 's' && selectedRow.type === 'untracked-harness') {
        const { skill } = selectedRow
        const skillName = skill.name
        pushSkillToLibrary(projectPath, skillName).then(() => loadData(skillName))
      }
    }

    // Actions for harnesses tab
    if (tab === 'harnesses') {
      if (input === ' ' || key.return) {
        const harness = harnesses[selectedIndex]
        if (harness) {
          const newEnabled = !harness.enabled
          const currentlyEnabled = harnesses.filter((h) => h.enabled).map((h) => h.id)
          setHarnessEnabled(projectPath, harness.id, newEnabled, currentlyEnabled)

          // Sync or remove skills based on toggle
          if (newEnabled) {
            // Sync all installed skills to this harness
            const skills = installedSkills.map((s) => ({ name: s.name, content: s.content }))
            syncAllSkillsToHarness(projectPath, harness.id as ToolId, skills)
          } else {
            // Remove all skills from this harness
            removeAllSkillsFromHarness(
              projectPath,
              harness.id as ToolId,
              installedSkills.map((s) => s.name),
            )
          }

          loadData()
        }
      }
    }
  })

  // Split rows by section
  const installedRows = skillRows.filter(
    (r) => r.type === 'installed-skill' || r.type === 'installed-harness'
  )
  const untrackedRows = skillRows.filter(
    (r) => r.type === 'untracked-skill' || r.type === 'untracked-harness'
  )
  const availableRows = skillRows.filter((r) => r.type === 'available-skill')

  const installedStartIndex = 0
  const untrackedStartIndex = installedRows.length
  const availableStartIndex = installedRows.length + untrackedRows.length

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          skillbook
        </Text>
        <Text dimColor> - {inProject ? 'Project Mode' : 'Library Mode'}</Text>
      </Box>

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
            {installedRows.length > 0 && (
              <>
                <Text bold dimColor>INSTALLED ({installedCount})</Text>
                {installedRows.map((row, i) => {
                  const key = row.type === 'installed-skill'
                    ? `skill-${row.skill.name}`
                    : `harness-${row.skill.name}-${row.harness.harnessId}`
                  return (
                    <RowDisplay
                      key={key}
                      row={row}
                      selected={selectedIndex === installedStartIndex + i}
                    />
                  )
                })}
              </>
            )}
            {untrackedRows.length > 0 && (
              <>
                <Box marginTop={installedRows.length > 0 ? 1 : 0}>
                  <Text bold dimColor>LOCAL ({untrackedCount})</Text>
                </Box>
                {untrackedRows.map((row, i) => {
                  const key = row.type === 'untracked-skill'
                    ? `local-${row.skill.name}`
                    : `local-harness-${row.skill.name}-${row.harness.harnessId}`
                  return (
                    <RowDisplay
                      key={key}
                      row={row}
                      selected={selectedIndex === untrackedStartIndex + i}
                    />
                  )
                })}
              </>
            )}
            {availableRows.length > 0 && (
              <>
                <Box marginTop={installedRows.length > 0 || untrackedRows.length > 0 ? 1 : 0}>
                  <Text bold dimColor>AVAILABLE ({availableCount})</Text>
                </Box>
                {availableRows.map((row, i) => (
                  <RowDisplay
                    key={`available-${row.skill.name}`}
                    row={row}
                    selected={selectedIndex === availableStartIndex + i}
                  />
                ))}
              </>
            )}
            {skillRows.length === 0 && (
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
        <HelpBar tab={tab} selectedRow={selectedRow} />
      </Box>

      {/* Confirmation dialog */}
      {confirmAction && (
        <Box
          borderStyle="round"
          borderColor="yellow"
          paddingX={1}
          paddingY={0}
          marginTop={1}
          flexDirection="column"
        >
          <Text>{confirmAction.message}</Text>
          <Text dimColor>[y]es  [n]o</Text>
        </Box>
      )}
    </Box>
  )
}

export const runTUI = (projectPath: string, inProject: boolean) => {
  render(<App projectPath={projectPath} inProject={inProject} />)
}

export default App
