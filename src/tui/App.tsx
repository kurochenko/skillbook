import { useState } from 'react'
import { render, Box, Text, useInput, useApp } from 'ink'
import {
  installSkill,
  uninstallSkill,
  pushSkillToLibrary,
  syncSkillFromLibrary,
} from '@/lib/project'
import {
  enableHarness,
  removeHarness,
  detachHarness,
} from '@/lib/harness'
import { TOOLS } from '@/constants'
import { RowDisplay } from '@/tui/components/SkillRow'
import { HarnessRow } from '@/tui/components/HarnessRow'
import { HelpBar, type Tab } from '@/tui/components/HelpBar'
import { ConfirmDialog, type ConfirmAction } from '@/tui/components/ConfirmDialog'
import { useSkillData } from '@/tui/hooks/useSkillData'

type AppProps = {
  projectPath: string
  inProject: boolean
}

const App = ({ projectPath, inProject }: AppProps) => {
  const { exit } = useApp()
  const [tab, setTab] = useState<Tab>('skills')
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)

  const {
    installedSkills,
    untrackedSkills,
    availableSkills,
    harnesses,
    skillRows,
    loadData,
    selectedIndex,
    setSelectedIndex,
  } = useSkillData(projectPath)

  const currentList = tab === 'skills' ? skillRows : harnesses
  const selectedRow = tab === 'skills' ? (skillRows[selectedIndex] ?? null) : null
  const selectedHarness = tab === 'harnesses' ? (harnesses[selectedIndex] ?? null) : null

  // Count skills for section headers
  const installedCount = installedSkills.length
  const untrackedCount = untrackedSkills.length
  const availableCount = availableSkills.length

  useInput((input, key) => {
    if (confirmAction) {
      if (input === 'y') {
        confirmAction.onConfirm()
        setConfirmAction(null)
      } else if (input === 'n' || key.escape) {
        setConfirmAction(null)
      }
      return
    }

    if (key.upArrow || input === 'k') {
      setSelectedIndex((i) => Math.max(0, i - 1))
    }
    if (key.downArrow || input === 'j') {
      setSelectedIndex((i) => Math.min(currentList.length - 1, i + 1))
    }

    if (key.tab) {
      setTab((t) => (t === 'skills' ? 'harnesses' : 'skills'))
      setSelectedIndex(0)
    }

    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit()
    }

    // Skills tab actions
    if (tab === 'skills' && selectedRow) {
      if (input === 'i' && selectedRow.type === 'available-skill') {
        const name = selectedRow.skill.name
        installSkill(projectPath, name).then(() => loadData())
      }

      if (input === 'u' && selectedRow.type === 'installed-skill') {
        const name = selectedRow.skill.name
        uninstallSkill(projectPath, name).then(() => loadData())
      }

      if (input === 'p') {
        if (selectedRow.type === 'installed-skill') {
          const name = selectedRow.skill.name
          pushSkillToLibrary(projectPath, name).then(() => loadData(name))
        } else if (selectedRow.type === 'untracked-skill') {
          const name = selectedRow.skill.name
          pushSkillToLibrary(projectPath, name).then(() => loadData(name))
        }
      }

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

      if (input === 's' && selectedRow.type === 'untracked-harness') {
        const { skill } = selectedRow
        const skillName = skill.name
        pushSkillToLibrary(projectPath, skillName).then(() => loadData(skillName))
      }
    }

    // Harnesses tab actions
    if (tab === 'harnesses' && selectedHarness) {
      const { state } = selectedHarness
      const installedSkillNames = installedSkills.map((s) => s.name)
      const currentlyEnabled = harnesses.filter((h) => h.state === 'enabled').map((h) => h.id)

      if (input === 'e' && (state === 'partial' || state === 'detached' || state === 'available')) {
        enableHarness(projectPath, selectedHarness.id, installedSkillNames, currentlyEnabled)
        loadData()
      }

      if (input === 'r' && (state === 'enabled' || state === 'detached' || state === 'partial')) {
        setConfirmAction({
          message: `Remove "${selectedHarness.name}" harness folder?\nThis will delete all files in the harness folder.`,
          onConfirm: () => {
            removeHarness(projectPath, selectedHarness.id, currentlyEnabled)
            loadData()
          },
        })
      }

      if (input === 'd' && (state === 'enabled' || state === 'partial')) {
        detachHarness(projectPath, selectedHarness.id, installedSkillNames, currentlyEnabled)
        loadData()
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
        <HelpBar tab={tab} selectedRow={selectedRow} selectedHarness={selectedHarness} />
      </Box>

      {/* Confirmation dialog */}
      {confirmAction && <ConfirmDialog action={confirmAction} />}
    </Box>
  )
}

export const runTUI = (projectPath: string, inProject: boolean) => {
  render(<App projectPath={projectPath} inProject={inProject} />)
}

export default App
