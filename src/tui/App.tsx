import { useState } from 'react'
import { render, Box, Text } from 'ink'
import {
  installSkill,
  uninstallSkill,
  pushSkillToLibrary,
  syncSkillFromLibrary,
  type InstalledSkill,
  type HarnessSkillInfo,
} from '@/lib/project'
import {
  enableHarness,
  removeHarness,
  detachHarness,
} from '@/lib/harness'
import { TOOLS } from '@/constants'
import { HarnessRow } from '@/tui/components/HarnessRow'
import { HelpBar, type Tab } from '@/tui/components/HelpBar'
import { ConfirmDialog, type ConfirmAction } from '@/tui/components/ConfirmDialog'
import { SkillSection } from '@/tui/components/SkillSection'
import { useSkillData } from '@/tui/hooks/useSkillData'
import { useListNavigation } from '@/tui/hooks/useListNavigation'
import { UI, SECTION_LABELS } from '@/tui/constants'

type AppProps = {
  projectPath: string
  inProject: boolean
}

const App = ({ projectPath, inProject }: AppProps) => {
  const [tab, setTab] = useState<Tab>('skills')
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)

  const {
    installedSkills,
    untrackedSkills,
    availableSkills,
    harnesses,
    skillRows,
    loadData,
  } = useSkillData(projectPath)

  const currentList = tab === 'skills' ? skillRows : harnesses

  const { selectedIndex, setSelectedIndex } = useListNavigation({
    listLength: currentList.length,
    confirmState: confirmAction,
    onConfirmCancel: () => setConfirmAction(null),
    onInput: (input, key) => {
      // Tab switching
      if (key.tab) {
        setTab((t) => (t === 'skills' ? 'harnesses' : 'skills'))
        setSelectedIndex(0)
        return
      }

      // Dispatch to tab-specific handlers
      if (tab === 'skills') {
        handleSkillsInput(input)
      } else {
        handleHarnessesInput(input)
      }
    },
  })

  const selectedRow = tab === 'skills' ? (skillRows[selectedIndex] ?? null) : null
  const selectedHarness = tab === 'harnesses' ? (harnesses[selectedIndex] ?? null) : null

  // Skills tab input handler
  const handleSkillsInput = (input: string) => {
    if (!selectedRow) return

    switch (input) {
      case 'i':
        handleInstall()
        break
      case 'u':
        handleUninstall()
        break
      case 'p':
        handlePush()
        break
      case 's':
        handleSync()
        break
    }
  }

  // Harnesses tab input handler
  const handleHarnessesInput = (input: string) => {
    if (!selectedHarness) return

    const { state } = selectedHarness
    const installedSkillNames = installedSkills.map((s) => s.name)
    const currentlyEnabled = harnesses.filter((h) => h.state === 'enabled').map((h) => h.id)

    switch (input) {
      case 'e':
        if (state === 'partial' || state === 'detached' || state === 'available') {
          enableHarness(projectPath, selectedHarness.id, installedSkillNames, currentlyEnabled)
          loadData()
        }
        break
      case 'r':
        if (state === 'enabled' || state === 'detached' || state === 'partial') {
          setConfirmAction({
            message: `Remove "${selectedHarness.name}" harness folder?\nThis will delete all files in the harness folder.`,
            onConfirm: () => {
              removeHarness(projectPath, selectedHarness.id, currentlyEnabled)
              loadData()
            },
          })
        }
        break
      case 'd':
        if (state === 'enabled' || state === 'partial') {
          detachHarness(projectPath, selectedHarness.id, installedSkillNames, currentlyEnabled)
          loadData()
        }
        break
    }
  }

  // Action handlers for skills tab
  const handleInstall = () => {
    if (selectedRow?.type !== 'available-skill') return
    installSkill(projectPath, selectedRow.skill.name).then(() => loadData())
  }

  const handleUninstall = () => {
    if (selectedRow?.type !== 'installed-skill') return
    uninstallSkill(projectPath, selectedRow.skill.name).then(() => loadData())
  }

  const handlePush = () => {
    if (selectedRow?.type !== 'installed-skill' && selectedRow?.type !== 'untracked-skill') return
    const name = selectedRow.skill.name
    pushSkillToLibrary(projectPath, name).then(() => loadData(name))
  }

  const handleSync = () => {
    if (!selectedRow) return

    // Skill-level sync
    if (selectedRow.type === 'installed-skill') {
      handleSkillSync(selectedRow.skill)
      return
    }

    // Harness-level sync (use as source)
    if (selectedRow.type === 'installed-harness') {
      handleHarnessSync(selectedRow.skill, selectedRow.harness)
      return
    }

    // Untracked harness sync
    if (selectedRow.type === 'untracked-harness') {
      const name = selectedRow.skill.name
      pushSkillToLibrary(projectPath, name).then(() => loadData(name))
    }
  }

  const handleSkillSync = (skill: InstalledSkill) => {
    const { name, status, isUnanimous } = skill

    if (!isUnanimous) return

    if (status === 'detached' || status === 'behind') {
      syncSkillFromLibrary(projectPath, name).then(() => loadData(name))
      return
    }

    if (status === 'conflict') {
      setConfirmAction({
        message: `Sync "${name}"? This will overwrite local changes with library version.`,
        onConfirm: () => syncSkillFromLibrary(projectPath, name).then(() => loadData(name)),
      })
    }
  }

  const handleHarnessSync = (skill: InstalledSkill, harness: HarnessSkillInfo) => {
    const harnessName = TOOLS[harness.harnessId].name
    const skillName = skill.name

    if (harness.status === 'ok') {
      // Already symlinked - check for conflicts in other harnesses
      const hasConflicts = skill.harnesses.some(
        (h) => h.harnessId !== harness.harnessId && h.status === 'conflict'
      )

      if (hasConflicts) {
        setConfirmAction({
          message: `Sync other harnesses to ${harnessName} version of "${skillName}"?\nThis will overwrite conflicting changes in other harnesses.`,
          onConfirm: () => syncSkillFromLibrary(projectPath, skillName).then(() => loadData(skillName)),
        })
      } else {
        syncSkillFromLibrary(projectPath, skillName).then(() => loadData(skillName))
      }
      return
    }

    if (harness.status === 'detached') {
      // Push then sync (not destructive)
      pushSkillToLibrary(projectPath, skillName).then(() =>
        syncSkillFromLibrary(projectPath, skillName).then(() => loadData(skillName))
      )
      return
    }

    // Conflict - needs confirmation
    setConfirmAction({
      message: `Use ${harnessName} version of "${skillName}" as source?\nThis will overwrite the library version and sync all harnesses.`,
      onConfirm: () =>
        pushSkillToLibrary(projectPath, skillName).then(() =>
          syncSkillFromLibrary(projectPath, skillName).then(() => loadData(skillName))
        ),
    })
  }

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
        <Text bold color="cyan">skillbook</Text>
        <Text dimColor> - {inProject ? 'Project Mode' : 'Library Mode'}</Text>
      </Box>

      {/* Tabs */}
      <Box marginBottom={1} gap={2}>
        <Text
          bold={tab === 'skills'}
          color={tab === 'skills' ? UI.SELECTED_COLOR : undefined}
          underline={tab === 'skills'}
        >
          Skills
        </Text>
        <Text
          bold={tab === 'harnesses'}
          color={tab === 'harnesses' ? UI.SELECTED_COLOR : undefined}
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
        minHeight={UI.CONTENT_MIN_HEIGHT}
      >
        {tab === 'skills' ? (
          <>
            <SkillSection
              label={SECTION_LABELS.INSTALLED}
              count={installedSkills.length}
              rows={installedRows}
              selectedIndex={selectedIndex}
              startIndex={installedStartIndex}
            />
            <SkillSection
              label={SECTION_LABELS.LOCAL}
              count={untrackedSkills.length}
              rows={untrackedRows}
              selectedIndex={selectedIndex}
              startIndex={untrackedStartIndex}
              marginTop={installedRows.length > 0}
            />
            <SkillSection
              label={SECTION_LABELS.AVAILABLE}
              count={availableSkills.length}
              rows={availableRows}
              selectedIndex={selectedIndex}
              startIndex={availableStartIndex}
              marginTop={installedRows.length > 0 || untrackedRows.length > 0}
            />
            {skillRows.length === 0 && (
              <Text dimColor>No skills found. Run `skillbook scan` to discover skills.</Text>
            )}
          </>
        ) : (
          <>
            <Text bold dimColor>{SECTION_LABELS.HARNESSES}</Text>
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
