import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react'
import { render, Box, Text, useStdout } from 'ink'
import { resolve, relative } from 'path'
import { existsSync } from 'fs'
import {
  addSkillToLibrary,
  addSkillDirToLibrary,
  scanProjectSkills,
  type ScannedSkill,
  type ScanSkillStatus,
} from '@/lib/library'
import { getProjectLockRoot } from '@/lib/lock-paths'
import { useListNavigation } from '@/tui/hooks/useListNavigation'
import { UI, SECTION_LABELS } from '@/tui/constants'
import { getStickyWindowStart } from '@/tui/window'

type ProjectInfo = {
  name: string
  path: string
  isManaged: boolean
  skills: ScannedSkill[]
}

const SCAN_STATUS_BADGE: Record<ScanSkillStatus, { text: string; color?: string; dim?: boolean }> = {
  synced: { text: '[matches]', color: 'green' },
  ahead: { text: '[differs]', color: 'yellow' },
  detached: { text: '[local]', dim: true },
}

const SCAN_HELP_ACTIONS: Partial<Record<ScanSkillStatus, string>> = {
  detached: '[a]dd to library',
  ahead: '[o]verwrite library',
}

const SCAN_BASE_ROWS = 16
const SCAN_HEIGHT_BUFFER = 1

type ScanRow =
  | { type: 'project'; project: ProjectInfo }
  | { type: 'skill'; skill: ScannedSkill; project: ProjectInfo }

const buildScanRows = (projects: ProjectInfo[]): ScanRow[] => {
  const rows: ScanRow[] = []
  for (const project of projects) {
    rows.push({ type: 'project', project })
    for (const skill of project.skills) {
      rows.push({ type: 'skill', skill, project })
    }
  }
  return rows
}

const getDisplayName = (projectPath: string, fallback: string, basePath: string) => {
  if (!projectPath) return fallback
  const relativePath = relative(basePath, projectPath)
  if (!relativePath || relativePath === '.' || relativePath.startsWith('..')) {
    return fallback
  }
  return relativePath
}

const buildProjectInfo = (skills: ScannedSkill[], basePath: string): ProjectInfo[] => {
  const projectMap = new Map<string, ScannedSkill[]>()
  const projectPaths = new Map<string, string>()
  const projectNames = new Map<string, string>()

  for (const skill of skills) {
    const key = skill.projectPath || skill.project
    const projectSkills = projectMap.get(key) ?? []
    projectSkills.push(skill)
    projectMap.set(key, projectSkills)

    if (!projectPaths.has(key)) {
      projectPaths.set(key, skill.projectPath)
    }

    if (!projectNames.has(key)) {
      projectNames.set(key, skill.project)
    }
  }

  const projectInfos: ProjectInfo[] = []

  for (const [key, projectSkills] of projectMap.entries()) {
    const path = projectPaths.get(key) ?? ''
    const fallbackName = projectNames.get(key) ?? key
    const name = getDisplayName(path, fallbackName, basePath)
    const isManaged = path ? existsSync(getProjectLockRoot(path)) : false
    projectInfos.push({
      name,
      path,
      isManaged,
      skills: projectSkills.sort((a, b) => a.name.localeCompare(b.name)),
    })
  }

  return projectInfos.sort((a, b) => a.name.localeCompare(b.name))
}

const SkillStatusBadge = memo(({ skill }: { skill: ScannedSkill }) => {
  const badge = SCAN_STATUS_BADGE[skill.status]
  return <Text color={badge.color} dimColor={badge.dim}>{badge.text}</Text>
})

const VariantWarning = memo(({ skill }: { skill: ScannedSkill }) => {
  if (!skill.hasConflict) return null
  return <Text color="red" wrap="truncate"> ⚠ 1 of {skill.conflictCount} variants</Text>
})

const ProjectRow = memo(({ project, selected }: { project: ProjectInfo; selected: boolean }) => {
  const cursor = selected ? '>' : ' '
  const color = selected ? UI.SELECTED_COLOR : undefined

  return (
    <Box>
      <Text color={color} bold={selected}>{cursor} </Text>
      {project.isManaged && <Text color="green">[✓ skillbook] </Text>}
      <Box flexGrow={1}>
        <Text color={color} bold={selected} wrap="truncate">{project.name}</Text>
      </Box>
      <Text dimColor wrap="truncate"> ({project.skills.length})</Text>
    </Box>
  )
})

const SkillRow = memo(({ skill, selected, isLast }: { skill: ScannedSkill; selected: boolean; isLast: boolean }) => {
  const cursor = selected ? '>' : ' '
  const color = selected ? UI.SELECTED_COLOR : undefined
  const prefix = isLast ? '└─' : '├─'

  return (
    <Box>
      <Text color={color} bold={selected}>{cursor}   {prefix} </Text>
      <Text color={color} bold={selected} wrap="truncate">{skill.name}</Text>
      <Text> </Text>
      <SkillStatusBadge skill={skill} />
      <VariantWarning skill={skill} />
    </Box>
  )
})

const RowDisplay = memo(({ row, selected, isLastSkill }: { row: ScanRow; selected: boolean; isLastSkill: boolean }) => {
  if (row.type === 'project') {
    return <ProjectRow project={row.project} selected={selected} />
  }
  return <SkillRow skill={row.skill} selected={selected} isLast={isLastSkill} />
})

const HelpBar = memo(({ action }: { action?: string }) => {
  const parts = action ? [action, '[q]uit'] : ['[q]uit']

  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1} flexDirection="row">
      <Text dimColor wrap="truncate">{parts.join('  ')}</Text>
    </Box>
  )
})

const getLegendCounts = (skills: ScannedSkill[]) => {
  let localCount = 0
  let matchesCount = 0
  let differsCount = 0

  for (const skill of skills) {
    if (skill.status === 'detached') localCount += 1
    if (skill.status === 'synced') matchesCount += 1
    if (skill.status === 'ahead') differsCount += 1
  }

  return { localCount, matchesCount, differsCount }
}

const Legend = memo(({ skills }: { skills: ScannedSkill[] }) => {
  const { localCount, matchesCount, differsCount } = getLegendCounts(skills)

  return (
    <Box marginBottom={1} flexDirection="row" gap={2}>
      {localCount > 0 && <Text dimColor>[local] not in library</Text>}
      {matchesCount > 0 && (
        <Text>
          <Text color="green">[matches]</Text>
          <Text dimColor> matches library version</Text>
        </Text>
      )}
      {differsCount > 0 && (
        <Text>
          <Text color="yellow">[differs]</Text>
          <Text dimColor> differs from library version</Text>
        </Text>
      )}
    </Box>
  )
})

type MessageColor = 'green' | 'yellow' | 'red' | 'cyan'
type Message = { text: string; color: MessageColor }

type ScanAppProps = {
  basePath: string
}

const ScanApp = ({ basePath }: ScanAppProps) => {
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [allSkills, setAllSkills] = useState<ScannedSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<Message | null>(null)
  const [pendingConfirm, setPendingConfirm] = useState<ScannedSkill | null>(null)
  const messageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const windowStartRef = useRef(0)
  const { stdout } = useStdout()

  useEffect(() => {
    return () => {
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current)
      }
    }
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    const skills = await scanProjectSkills(basePath)
    setAllSkills(skills)
    setProjects(buildProjectInfo(skills, basePath))
    setLoading(false)
  }, [basePath])

  useEffect(() => {
    loadData()
  }, [loadData])

  const rows = useMemo(() => buildScanRows(projects), [projects])

  const { selectedIndex } = useListNavigation({
    listLength: rows.length,
    confirmState: pendingConfirm ? {
      message: `Overwrite '${pendingConfirm.name}' in library?`,
      onConfirm: () => handleAdd(pendingConfirm),
    } : null,
    onConfirmCancel: () => setPendingConfirm(null),
    onInput: (input) => {
      const selectedRow = rows[selectedIndex] ?? null
      if (!selectedRow || selectedRow.type !== 'skill') return

      const { status } = selectedRow.skill

      if (input === 'a' && status === 'detached') {
        handleAdd(selectedRow.skill)
      }

      if (input === 'o' && status === 'ahead') {
        setPendingConfirm(selectedRow.skill)
      }
    },
  })

  const selectedRow = rows[selectedIndex] ?? null

  const terminalRows = stdout?.rows ?? 0
  const availableRows = terminalRows > 0
    ? terminalRows - SCAN_BASE_ROWS - SCAN_HEIGHT_BUFFER
    : UI.CONTENT_MIN_HEIGHT
  const windowSize = rows.length === 0
    ? 0
    : Math.min(rows.length, Math.max(1, availableRows))
  const windowStart = getStickyWindowStart(
    windowStartRef.current,
    selectedIndex,
    rows.length,
    windowSize,
  )

  useEffect(() => {
    windowStartRef.current = windowStart
  })

  const visibleRows = useMemo(
    () => rows.slice(windowStart, windowStart + windowSize),
    [rows, windowStart, windowSize],
  )

  const isLastSkillInProject = (index: number): boolean => {
    const row = rows[index]
    if (row?.type !== 'skill') return false
    const nextRow = rows[index + 1]
    return !nextRow || nextRow.type === 'project'
  }

  const handleAdd = async (skill: ScannedSkill) => {
    const result = skill.dirPath
      ? await addSkillDirToLibrary(skill.name, skill.dirPath)
      : await addSkillToLibrary(skill.name, skill.content)

    if (!result.success) {
      setMessage({ text: `Failed: ${result.error}`, color: 'red' })
      return
    }

    switch (result.action) {
      case 'added':
        setMessage({ text: `Added '${skill.name}' to library`, color: 'green' })
        break
      case 'updated':
        setMessage({ text: `Updated '${skill.name}' in library`, color: 'yellow' })
        break
    }

    await loadData()

    if (messageTimeoutRef.current) {
      clearTimeout(messageTimeoutRef.current)
    }
    messageTimeoutRef.current = setTimeout(() => setMessage(null), UI.MESSAGE_TIMEOUT_MS)
  }

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>Scanning for skills...</Text>
      </Box>
    )
  }

  if (projects.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">No skills found</Text>
        <Text dimColor>Looked in: .claude/skills/, .cursor/rules/, .opencode/skill/</Text>
      </Box>
    )
  }

  const helpAction = pendingConfirm
    ? undefined
    : selectedRow?.type === 'skill'
        ? SCAN_HELP_ACTIONS[selectedRow.skill.status]
        : undefined

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>skillbook</Text>
      <Text dimColor> - Library Scan</Text>
      <Box marginTop={1} />

      <Text dimColor wrap="truncate">Find skills across projects and add them to your central library.</Text>
      <Box marginTop={1} />

      <Legend skills={allSkills} />

      <Text bold>{SECTION_LABELS.PROJECTS} ({projects.length})</Text>
      <Text dimColor>{allSkills.length} skills found</Text>
      <Box marginTop={1} />

      <Box flexDirection="column">
        {visibleRows.map((row, index) => {
          const totalIndex = windowStart + index
          const projectKey = row.project.path || row.project.name
          const key = row.type === 'project'
            ? `project-${projectKey}`
            : `skill-${projectKey}-${row.skill.name}`

          return (
            <RowDisplay
              key={key}
              row={row}
              selected={totalIndex === selectedIndex}
              isLastSkill={isLastSkillInProject(totalIndex)}
            />
          )
        })}
      </Box>

      <Box marginTop={1} />

      {message && (
        <Box marginBottom={1}>
          <Text color={message.color}>{message.text}</Text>
        </Box>
      )}

      {pendingConfirm && (
        <Box marginBottom={1} flexDirection="column">
          <Text color="yellow">
            Overwrite '{pendingConfirm.name}' in library? This will replace the existing version.
          </Text>
          <Text dimColor>[y]es  [n]o</Text>
        </Box>
      )}

      <HelpBar action={helpAction} />
    </Box>
  )
}

export const runScanApp = (basePath: string) => {
  render(<ScanApp basePath={resolve(basePath)} />)
}

export default ScanApp
