import { useState, useEffect, useCallback } from 'react'
import { render, Box, Text, useInput, useApp } from 'ink'
import {
  addSkillToLibrary,
  scanProjectSkills,
  type ScannedSkill,
} from '../lib/library.js'
import { isSkillbookInitialized } from '../lib/sparse-checkout.js'
import { resolve, dirname } from 'path'

type ProjectInfo = {
  name: string
  path: string
  isManaged: boolean  // Has .skillbook/ initialized
  skills: ScannedSkill[]
}

// A row in the scan list - can be a project header or a skill
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
  // Find the project directory in the path
  const idx = skillPath.lastIndexOf(`/${projectName}/`)
  if (idx !== -1) {
    return skillPath.slice(0, idx + projectName.length + 1)
  }
  // Fallback: go up from skill path
  return dirname(dirname(dirname(skillPath)))
}

// Status badge component (right-aligned)
const SkillStatusBadge = ({ skill }: { skill: ScannedSkill }) => {
  if (skill.status === 'synced') {
    return <Text color="green">[matches]</Text>
  }
  if (skill.status === 'ahead') {
    return <Text color="yellow">[differs]</Text>
  }
  // detached = local only
  return <Text dimColor>[local]</Text>
}

// Variant warning component
const VariantWarning = ({ skill }: { skill: ScannedSkill }) => {
  if (!skill.hasConflict) return null
  return <Text color="red"> ⚠ 1 of {skill.conflictCount} variants</Text>
}

// Project row component
const ProjectRow = ({
  project,
  selected,
}: {
  project: ProjectInfo
  selected: boolean
}) => {
  const cursor = selected ? '>' : ' '
  const color = selected ? 'blue' : undefined
  const bold = selected

  return (
    <Box>
      <Text color={color} bold={bold}>{cursor} </Text>
      {project.isManaged && <Text color="green">[✓ skillbook] </Text>}
      <Text color={color} bold={bold}>{project.name}</Text>
      <Text dimColor> ({project.skills.length})</Text>
    </Box>
  )
}

// Skill row component
const SkillRow = ({
  skill,
  selected,
  isLast,
}: {
  skill: ScannedSkill
  selected: boolean
  isLast: boolean
}) => {
  const cursor = selected ? '>' : ' '
  const color = selected ? 'blue' : undefined
  const bold = selected
  const prefix = isLast ? '└─' : '├─'

  return (
    <Box>
      <Text color={color} bold={bold}>{cursor}   {prefix} </Text>
      <Text color={color} bold={bold}>
        {skill.name}
      </Text>
      <Text> </Text>
      <SkillStatusBadge skill={skill} />
      <VariantWarning skill={skill} />
    </Box>
  )
}

// Row display component
const RowDisplay = ({
  row,
  selected,
  isLastSkill,
}: {
  row: ScanRow
  selected: boolean
  isLastSkill: boolean
}) => {
  if (row.type === 'project') {
    return <ProjectRow project={row.project} selected={selected} />
  }
  return <SkillRow skill={row.skill} selected={selected} isLast={isLastSkill} />
}

// Help bar component
const HelpBar = ({ selectedRow }: { selectedRow: ScanRow | null }) => {
  const parts: string[] = []

  if (selectedRow?.type === 'skill') {
    const { status } = selectedRow.skill
    if (status === 'detached') {
      parts.push('[a]dd to library')
    } else if (status === 'ahead') {
      parts.push('[o]verwrite library')
    }
  }

  parts.push('[q]uit')

  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1} flexDirection="row">
      <Text dimColor wrap="truncate">{parts.join('  ')}</Text>
    </Box>
  )
}

// Legend component
const Legend = ({ skills }: { skills: ScannedSkill[] }) => {
  const localCount = skills.filter((s) => s.status === 'detached').length
  const matchesCount = skills.filter((s) => s.status === 'synced').length
  const differsCount = skills.filter((s) => s.status === 'ahead').length

  return (
    <Box marginBottom={1} flexDirection="row" gap={2}>
      {localCount > 0 && <Text dimColor>[local] not in library</Text>}
      {matchesCount > 0 && <Text><Text color="green">[matches]</Text><Text dimColor> matches library version</Text></Text>}
      {differsCount > 0 && <Text><Text color="yellow">[differs]</Text><Text dimColor> differs from library version</Text></Text>}
    </Box>
  )
}

type ScanAppProps = {
  basePath: string
}

const ScanApp = ({ basePath }: ScanAppProps) => {
  const { exit } = useApp()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [allSkills, setAllSkills] = useState<ScannedSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ text: string; color: string } | null>(null)
  const [pendingConfirm, setPendingConfirm] = useState<ScannedSkill | null>(null)

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
      
      // Store project path
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
  const selectedRow = rows[selectedIndex] ?? null

  // Check if current skill row is last in its project
  const isLastSkillInProject = (index: number): boolean => {
    const row = rows[index]
    if (row?.type !== 'skill') return false
    
    const nextRow = rows[index + 1]
    return !nextRow || nextRow.type === 'project'
  }

  // Handle add action
  const handleAdd = async (skill: ScannedSkill) => {
    const result = await addSkillToLibrary(skill.name, skill.content)
    
    if (!result.success) {
      setMessage({ text: `Failed: ${result.error}`, color: 'red' })
      return
    }

    if (result.action === 'added') {
      setMessage({ text: `Added '${skill.name}' to library`, color: 'green' })
    } else if (result.action === 'updated') {
      setMessage({ text: `Updated '${skill.name}' in library`, color: 'yellow' })
    }

    // Reload data to update statuses
    await loadData()
    
    // Clear message after a delay
    setTimeout(() => setMessage(null), 2000)
  }

  useInput((input, key) => {
    // Handle confirmation dialog
    if (pendingConfirm) {
      if (input === 'y' || input === 'Y') {
        const skill = pendingConfirm
        setPendingConfirm(null)
        handleAdd(skill)
      } else if (input === 'n' || input === 'N' || key.escape) {
        setPendingConfirm(null)
      }
      return
    }

    // Navigation
    if (key.upArrow || input === 'k') {
      setSelectedIndex((i) => Math.max(0, i - 1))
    }
    if (key.downArrow || input === 'j') {
      setSelectedIndex((i) => Math.min(rows.length - 1, i + 1))
    }

    // Quit
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit()
    }

    // Add to library (for local skills)
    if (input === 'a' && selectedRow?.type === 'skill') {
      const { status } = selectedRow.skill
      if (status === 'detached') {
        handleAdd(selectedRow.skill)
      }
    }

    // Overwrite library (for differs skills - requires confirmation)
    if (input === 'o' && selectedRow?.type === 'skill') {
      const { status } = selectedRow.skill
      if (status === 'ahead') {
        setPendingConfirm(selectedRow.skill)
      }
    }
  })

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

  const totalSkills = allSkills.length
  const projectCount = projects.length

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>skillbook</Text>
      <Text dimColor> - Library Scan</Text>
      <Box marginTop={1} />
      
      <Text dimColor>Find skills across projects and add them to your central library.</Text>
      <Box marginTop={1} />

      <Legend skills={allSkills} />

      <Text bold>PROJECTS ({projectCount})</Text>
      <Text dimColor>{totalSkills} skills found</Text>
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
          <Text color={message.color as any}>{message.text}</Text>
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
