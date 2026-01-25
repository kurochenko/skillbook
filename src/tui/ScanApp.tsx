import { useState, useEffect, useCallback, useRef } from 'react'
import { render, Box, Text } from 'ink'
import { resolve, dirname } from 'path'
import {
  addSkillToLibrary,
  scanProjectSkills,
  type ScannedSkill,
  type ScanSkillStatus,
} from '@/lib/library'
import { isSkillbookInitialized } from '@/lib/sparse-checkout'
import { useListNavigation } from '@/tui/hooks/useListNavigation'
import { UI, SECTION_LABELS } from '@/tui/constants'

type ProjectInfo = {
  name: string
  path: string
  isManaged: boolean
  skills: ScannedSkill[]
}

// Status badge configuration
const SCAN_STATUS_BADGE: Record<ScanSkillStatus, { text: string; color?: string; dim?: boolean }> = {
  synced: { text: '[matches]', color: 'green' },
  ahead: { text: '[differs]', color: 'yellow' },
  detached: { text: '[local]', dim: true },
}

// Help actions by status
const SCAN_HELP_ACTIONS: Partial<Record<ScanSkillStatus, string>> = {
  detached: '[a]dd to library',
  ahead: '[o]verwrite library',
}

// Row types for the scan list
type ScanRow =
  | { type: 'project'; project: ProjectInfo }
  | { type: 'skill'; skill: ScannedSkill; project: ProjectInfo }

// Build flat list of rows with project grouping
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

// Get project path from skill path
const getProjectPath = (skillPath: string, projectName: string): string => {
  const idx = skillPath.lastIndexOf(`/${projectName}/`)
  if (idx !== -1) {
    return skillPath.slice(0, idx + projectName.length + 1)
  }
  return dirname(dirname(dirname(skillPath)))
}

// Component: Status badge
const SkillStatusBadge = ({ skill }: { skill: ScannedSkill }) => {
  const badge = SCAN_STATUS_BADGE[skill.status]
  return <Text color={badge.color} dimColor={badge.dim}>{badge.text}</Text>
}

// Component: Variant warning
const VariantWarning = ({ skill }: { skill: ScannedSkill }) => {
  if (!skill.hasConflict) return null
  return <Text color="red"> ⚠ 1 of {skill.conflictCount} variants</Text>
}

// Component: Project row
const ProjectRow = ({ project, selected }: { project: ProjectInfo; selected: boolean }) => {
  const cursor = selected ? '>' : ' '
  const color = selected ? UI.SELECTED_COLOR : undefined

  return (
    <Box>
      <Text color={color} bold={selected}>{cursor} </Text>
      {project.isManaged && <Text color="green">[✓ skillbook] </Text>}
      <Text color={color} bold={selected}>{project.name}</Text>
      <Text dimColor> ({project.skills.length})</Text>
    </Box>
  )
}

// Component: Skill row
const SkillRow = ({ skill, selected, isLast }: { skill: ScannedSkill; selected: boolean; isLast: boolean }) => {
  const cursor = selected ? '>' : ' '
  const color = selected ? UI.SELECTED_COLOR : undefined
  const prefix = isLast ? '└─' : '├─'

  return (
    <Box>
      <Text color={color} bold={selected}>{cursor}   {prefix} </Text>
      <Text color={color} bold={selected}>{skill.name}</Text>
      <Text> </Text>
      <SkillStatusBadge skill={skill} />
      <VariantWarning skill={skill} />
    </Box>
  )
}

// Component: Row display (project or skill)
const RowDisplay = ({ row, selected, isLastSkill }: { row: ScanRow; selected: boolean; isLastSkill: boolean }) => {
  if (row.type === 'project') {
    return <ProjectRow project={row.project} selected={selected} />
  }
  return <SkillRow skill={row.skill} selected={selected} isLast={isLastSkill} />
}

// Component: Help bar
const HelpBar = ({ selectedRow }: { selectedRow: ScanRow | null }) => {
  const action = selectedRow?.type === 'skill'
    ? SCAN_HELP_ACTIONS[selectedRow.skill.status]
    : undefined

  const parts = action ? [action, '[q]uit'] : ['[q]uit']

  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1} flexDirection="row">
      <Text dimColor wrap="truncate">{parts.join('  ')}</Text>
    </Box>
  )
}

// Component: Legend
const Legend = ({ skills }: { skills: ScannedSkill[] }) => {
  const localCount = skills.filter((s) => s.status === 'detached').length
  const matchesCount = skills.filter((s) => s.status === 'synced').length
  const differsCount = skills.filter((s) => s.status === 'ahead').length

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
}

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

  // Cleanup message timeout on unmount
  useEffect(() => {
    return () => {
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current)
      }
    }
  }, [])

  // Load/reload data
  const loadData = useCallback(async () => {
    setLoading(true)
    const skills = await scanProjectSkills(basePath)
    setAllSkills(skills)

    // Group by project and detect managed status
    const projectMap = new Map<string, ScannedSkill[]>()
    const projectPaths = new Map<string, string>()

    for (const skill of skills) {
      const projectSkills = projectMap.get(skill.project) ?? []
      projectSkills.push(skill)
      projectMap.set(skill.project, projectSkills)

      if (!projectPaths.has(skill.project)) {
        projectPaths.set(skill.project, getProjectPath(skill.path, skill.project))
      }
    }

    // Build project info with managed status
    const projectInfos: ProjectInfo[] = []
    const sortedNames = Array.from(projectMap.keys()).sort()

    for (const name of sortedNames) {
      const skills = projectMap.get(name)!.sort((a, b) => a.name.localeCompare(b.name))
      const path = projectPaths.get(name) ?? ''
      const isManaged = path ? isSkillbookInitialized(path) : false
      projectInfos.push({ name, path, isManaged, skills })
    }

    setProjects(projectInfos)
    setLoading(false)
  }, [basePath])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Build flat list of rows
  const rows = buildScanRows(projects)

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

  // Check if current skill row is last in its project
  const isLastSkillInProject = (index: number): boolean => {
    const row = rows[index]
    if (row?.type !== 'skill') return false
    const nextRow = rows[index + 1]
    return !nextRow || nextRow.type === 'project'
  }

  const handleAdd = async (skill: ScannedSkill) => {
    const result = await addSkillToLibrary(skill.name, skill.content)

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

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>skillbook</Text>
      <Text dimColor> - Library Scan</Text>
      <Box marginTop={1} />

      <Text dimColor>Find skills across projects and add them to your central library.</Text>
      <Box marginTop={1} />

      <Legend skills={allSkills} />

      <Text bold>{SECTION_LABELS.PROJECTS} ({projects.length})</Text>
      <Text dimColor>{allSkills.length} skills found</Text>
      <Box marginTop={1} />

      <Box flexDirection="column">
        {rows.map((row, index) => (
          <RowDisplay
            key={`row-${index}`}
            row={row}
            selected={index === selectedIndex}
            isLastSkill={isLastSkillInProject(index)}
          />
        ))}
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

      <HelpBar selectedRow={pendingConfirm ? null : selectedRow} />
    </Box>
  )
}

export const runScanApp = (basePath: string) => {
  render(<ScanApp basePath={resolve(basePath)} />)
}

export default ScanApp
