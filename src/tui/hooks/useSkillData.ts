import { useState, useEffect, useCallback } from 'react'
import {
  getInstalledSkills,
  getUntrackedSkills,
  getAvailableSkills,
  type InstalledSkill,
  type UntrackedSkill,
  type AvailableSkill,
} from '@/lib/project'
import { getHarnessesInfo, type HarnessInfo } from '@/lib/harness'
import { buildSkillRows, type SkillRow } from '@/tui/components/SkillRow'

export type UseSkillDataResult = {
  installedSkills: InstalledSkill[]
  untrackedSkills: UntrackedSkill[]
  availableSkills: AvailableSkill[]
  harnesses: HarnessInfo[]
  skillRows: SkillRow[]
  loadData: (selectSkillName?: string) => void
  selectedIndex: number
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>
}

export const useSkillData = (projectPath: string): UseSkillDataResult => {
  const [installedSkills, setInstalledSkills] = useState<InstalledSkill[]>([])
  const [untrackedSkills, setUntrackedSkills] = useState<UntrackedSkill[]>([])
  const [availableSkills, setAvailableSkills] = useState<AvailableSkill[]>([])
  const [harnesses, setHarnesses] = useState<HarnessInfo[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Load data, optionally selecting a specific skill by name
  const loadData = useCallback((selectSkillName?: string) => {
    const installed = getInstalledSkills(projectPath)
    const untracked = getUntrackedSkills(projectPath)
    const available = getAvailableSkills(projectPath)

    setInstalledSkills(installed)
    setUntrackedSkills(untracked)
    setAvailableSkills(available)
    const installedSkillNames = installed.map((s) => s.name)
    setHarnesses(getHarnessesInfo(projectPath, installedSkillNames))

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

  return {
    installedSkills,
    untrackedSkills,
    availableSkills,
    harnesses,
    skillRows,
    loadData,
    selectedIndex,
    setSelectedIndex,
  }
}
