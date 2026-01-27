import { useState, useEffect, useRef } from 'react'
import { render, Box, Text } from 'ink'
import {
  installSkill,
  uninstallSkill,
  removeSkill,
  pushSkillToLibrary,
  syncSkillFromLibrary,
} from '@/lib/project-actions'
import type { InstalledSkill, HarnessSkillInfo } from '@/lib/project-scan'
import {
  enableHarness,
  removeHarness,
  detachHarness,
} from '@/lib/harness'
import { type ActionResult } from '@/lib/action-result'
import { logError, logInfo, type LogContext } from '@/lib/logger'
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
  const [message, setMessage] = useState<{ text: string; color: 'red' } | null>(null)
  const messageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      if (key.tab) {
        setTab((t) => (t === 'skills' ? 'harnesses' : 'skills'))
        setSelectedIndex(0)
        return
      }

      if (tab === 'skills') {
        handleSkillsInput(input)
      } else {
        handleHarnessesInput(input)
      }
    },
  })

  const selectedRow = tab === 'skills' ? (skillRows[selectedIndex] ?? null) : null
  const selectedHarness = tab === 'harnesses' ? (harnesses[selectedIndex] ?? null) : null

  useEffect(() => {
    return () => {
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current)
      }
    }
  }, [])

  const showError = (text: string) => {
    setMessage({ text, color: 'red' })
    if (messageTimeoutRef.current) {
      clearTimeout(messageTimeoutRef.current)
    }
    messageTimeoutRef.current = setTimeout(() => setMessage(null), UI.MESSAGE_TIMEOUT_MS)
  }

  const runAction = async (
    action: Promise<ActionResult>,
    onSuccess?: () => void,
    context?: LogContext,
    onFailure?: () => void,
  ) => {
    try {
      const result = await action
      if (result.success) {
        onSuccess?.()
        return
      }
      logError('Action failed', result.error, context)
      showError(result.error)
      onFailure?.()
    } catch (error) {
      logError('Action threw error', error, context)
      const message = error instanceof Error ? error.message : 'Unexpected error'
      showError(message)
      onFailure?.()
    }
  }

  const runSyncAction = (
    action: () => ActionResult,
    onSuccess?: () => void,
    context?: LogContext,
    onFailure?: () => void,
  ) => {
    void runAction(Promise.resolve().then(action), onSuccess, context, onFailure)
  }

  const runPushThenSync = async (skillName: string) => {
    logInfo('Push then sync requested', { action: 'pushThenSync', skillName, projectPath })

    try {
      const pushResult = await pushSkillToLibrary(projectPath, skillName)
      if (!pushResult.success) {
        logError('Push failed', pushResult.error, { action: 'pushSkillToLibrary', skillName })
        showError(pushResult.error)
        return
      }

      const syncResult = await syncSkillFromLibrary(projectPath, skillName)
      if (!syncResult.success) {
        logError('Sync failed', syncResult.error, { action: 'syncSkillFromLibrary', skillName })
        showError(syncResult.error)
        return
      }

      loadData(skillName)
    } catch (error) {
      logError('Push then sync failed', error, { action: 'pushThenSync', skillName })
      const message = error instanceof Error ? error.message : 'Unexpected error'
      showError(message)
    }
  }

  const splitSkillRows = (rows: typeof skillRows) => {
    const installed = rows.filter((r) => r.type === 'installed-skill' || r.type === 'installed-harness')
    const untracked = rows.filter((r) => r.type === 'untracked-skill' || r.type === 'untracked-harness')
    const available = rows.filter((r) => r.type === 'available-skill')

    return {
      installed,
      untracked,
      available,
    }
  }

  const handleSkillsInput = (input: string) => {
    if (!selectedRow) return

    switch (input) {
      case 'i':
        handleInstall()
        break
      case 'u':
        handleUninstall()
        break
      case 'r':
        handleRemove()
        break
      case 'p':
        handlePush()
        break
      case 's':
        handleSync()
        break
    }
  }

  const handleHarnessesInput = (input: string) => {
    if (!selectedHarness) return

    const { state } = selectedHarness
    const installedSkillNames = installedSkills.map((s) => s.name)
    const currentlyEnabled = harnesses.filter((h) => h.state === 'enabled').map((h) => h.id)

    switch (input) {
      case 'e':
        if (state === 'partial' || state === 'detached' || state === 'available') {
          logInfo('Enable harness requested', {
            action: 'enableHarness',
            harnessId: selectedHarness.id,
            harnessState: state,
            projectPath,
          })
          runSyncAction(
            () => enableHarness(projectPath, selectedHarness.id, installedSkillNames, currentlyEnabled),
            () => loadData(),
            { action: 'enableHarness', harnessId: selectedHarness.id },
            () => loadData(),
          )
        }
        break
      case 'r':
        if (state === 'enabled' || state === 'detached' || state === 'partial') {
          setConfirmAction({
            message: `Remove "${selectedHarness.name}" harness folder?\nThis will delete all files in the harness folder.`,
            onConfirm: () => {
              logInfo('Remove harness confirmed', {
                action: 'removeHarness',
                harnessId: selectedHarness.id,
                harnessState: state,
                projectPath,
              })
              runSyncAction(
                () => removeHarness(projectPath, selectedHarness.id, currentlyEnabled),
                () => loadData(),
                { action: 'removeHarness', harnessId: selectedHarness.id },
                () => loadData(),
              )
            },
          })
        }
        break
      case 'd':
        if (state === 'enabled' || state === 'partial') {
          logInfo('Detach harness requested', {
            action: 'detachHarness',
            harnessId: selectedHarness.id,
            harnessState: state,
            projectPath,
          })
          runSyncAction(
            () => detachHarness(projectPath, selectedHarness.id, installedSkillNames, currentlyEnabled),
            () => loadData(),
            { action: 'detachHarness', harnessId: selectedHarness.id },
            () => loadData(),
          )
        }
        break
    }
  }

  const handleInstall = () => {
    if (selectedRow?.type !== 'available-skill') return
    const skillName = selectedRow.skill.name
    logInfo('Install skill requested', { action: 'installSkill', skillName, projectPath })
    void runAction(
      installSkill(projectPath, skillName),
      () => loadData(),
      { action: 'installSkill', skillName },
    )
  }

  const handleUninstall = () => {
    if (selectedRow?.type !== 'installed-skill') return
    const skillName = selectedRow.skill.name
    logInfo('Uninstall skill requested', { action: 'uninstallSkill', skillName, projectPath })
    void runAction(
      uninstallSkill(projectPath, skillName),
      () => loadData(),
      { action: 'uninstallSkill', skillName },
    )
  }

  const handleRemove = () => {
    if (selectedRow?.type !== 'installed-skill') return
    const { status } = selectedRow.skill
    if (status !== 'detached' && status !== 'conflict') return
    const skillName = selectedRow.skill.name
    logInfo('Remove skill requested', { action: 'removeSkill', skillName, projectPath, status })
    void runAction(
      removeSkill(projectPath, skillName),
      () => loadData(),
      { action: 'removeSkill', skillName },
    )
  }

  const handlePush = () => {
    if (selectedRow?.type !== 'installed-skill' && selectedRow?.type !== 'untracked-skill') return
    const name = selectedRow.skill.name
    logInfo('Push skill requested', { action: 'pushSkillToLibrary', skillName: name, projectPath })
    void runAction(
      pushSkillToLibrary(projectPath, name),
      () => loadData(name),
      { action: 'pushSkillToLibrary', skillName: name },
    )
  }

  const handleSync = () => {
    if (!selectedRow) return

    if (selectedRow.type === 'installed-skill') {
      handleSkillSync(selectedRow.skill)
      return
    }

    if (selectedRow.type === 'installed-harness') {
      handleHarnessSync(selectedRow.skill, selectedRow.harness)
      return
    }

    if (selectedRow.type === 'untracked-harness') {
      const name = selectedRow.skill.name
      logInfo('Push untracked harness skill requested', {
        action: 'pushSkillToLibrary',
        skillName: name,
        projectPath,
      })
      void runAction(
        pushSkillToLibrary(projectPath, name),
        () => loadData(name),
        { action: 'pushSkillToLibrary', skillName: name },
      )
    }
  }

  const handleSkillSync = (skill: InstalledSkill) => {
    const { name, status, isUnanimous } = skill

    if (!isUnanimous) return

    if (status === 'detached' || status === 'behind') {
      logInfo('Sync skill requested', { action: 'syncSkillFromLibrary', skillName: name, status })
      void runAction(
        syncSkillFromLibrary(projectPath, name),
        () => loadData(name),
        { action: 'syncSkillFromLibrary', skillName: name },
      )
      return
    }

    if (status === 'conflict') {
      setConfirmAction({
        message: `Sync "${name}"? This will overwrite local changes with library version.`,
        onConfirm: () => {
          logInfo('Sync skill confirmed', { action: 'syncSkillFromLibrary', skillName: name })
          void runAction(
            syncSkillFromLibrary(projectPath, name),
            () => loadData(name),
            { action: 'syncSkillFromLibrary', skillName: name },
          )
        },
      })
    }
  }

  const handleHarnessSync = (skill: InstalledSkill, harness: HarnessSkillInfo) => {
    const harnessName = TOOLS[harness.harnessId].name
    const skillName = skill.name

    if (harness.status === 'ok') {
      const hasConflicts = skill.harnesses.some(
        (h) => h.harnessId !== harness.harnessId && h.status === 'conflict'
      )

      if (hasConflicts) {
        setConfirmAction({
          message: `Sync other harnesses to ${harnessName} version of "${skillName}"?\nThis will overwrite conflicting changes in other harnesses.`,
          onConfirm: () => {
            logInfo('Sync harnesses confirmed', {
              action: 'syncSkillFromLibrary',
              skillName,
              harnessId: harness.harnessId,
            })
            void runAction(
              syncSkillFromLibrary(projectPath, skillName),
              () => loadData(skillName),
              { action: 'syncSkillFromLibrary', skillName, harnessId: harness.harnessId },
            )
          },
        })
      } else {
        logInfo('Sync harnesses requested', {
          action: 'syncSkillFromLibrary',
          skillName,
          harnessId: harness.harnessId,
        })
        void runAction(
          syncSkillFromLibrary(projectPath, skillName),
          () => loadData(skillName),
          { action: 'syncSkillFromLibrary', skillName, harnessId: harness.harnessId },
        )
      }
      return
    }

    if (harness.status === 'detached') {
      void runPushThenSync(skillName)
      return
    }

    setConfirmAction({
      message: `Use ${harnessName} version of "${skillName}" as source?\nThis will overwrite the library version and sync all harnesses.`,
      onConfirm: () => void runPushThenSync(skillName),
    })
  }

  const { installed: installedRows, untracked: untrackedRows, available: availableRows } = splitSkillRows(skillRows)

  const installedStartIndex = 0
  const untrackedStartIndex = installedRows.length
  const availableStartIndex = installedRows.length + untrackedRows.length

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">skillbook</Text>
        <Text dimColor> - {inProject ? 'Project Mode' : 'Library Mode'}</Text>
      </Box>

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

      {message && (
        <Box marginTop={1}>
          <Text color={message.color}>{message.text}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <HelpBar tab={tab} selectedRow={selectedRow} selectedHarness={selectedHarness} />
      </Box>

      {confirmAction && <ConfirmDialog action={confirmAction} />}
    </Box>
  )
}

export const runTUI = (projectPath: string, inProject: boolean) => {
  render(<App projectPath={projectPath} inProject={inProject} />)
}

export default App
