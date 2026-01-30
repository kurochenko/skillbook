import { useState, useEffect, useCallback } from 'react'
import {
  getProjectSkills,
  getAvailableSkills,
  type InstalledSkill,
  type UntrackedSkill,
  type AvailableSkill,
} from '@/lib/project-scan'
import { getHarnessesInfo, type HarnessInfo } from '@/lib/harness'
import { buildSkillRows, type SkillRow } from '@/tui/components/SkillRow'

export type UseSkillDataResult = {
  installedSkills: InstalledSkill[]
  untrackedSkills: UntrackedSkill[]
  availableSkills: AvailableSkill[]
  harnesses: HarnessInfo[]
  skillRows: SkillRow[]
  loadData: (selectSkillName?: string) => Promise<void>
  selectedIndex: number
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>
}

export const useSkillData = (projectPath: string): UseSkillDataResult => {
  const [installedSkills, setInstalledSkills] = useState<InstalledSkill[]>([])
  const [untrackedSkills, setUntrackedSkills] = useState<UntrackedSkill[]>([])
  const [availableSkills, setAvailableSkills] = useState<AvailableSkill[]>([])
  const [harnesses, setHarnesses] = useState<HarnessInfo[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)

  const findSkillIndex = (rows: SkillRow[], skillName: string): number =>
    rows.findIndex(
      (row) =>
        (row.type === 'installed-skill' && row.skill.name === skillName) ||
        (row.type === 'untracked-skill' && row.skill.name === skillName)
    )

  const loadData = useCallback(async (selectSkillName?: string) => {
    const { installed, untracked } = await getProjectSkills(projectPath)
    const available = await getAvailableSkills(projectPath, installed)

    setInstalledSkills(installed)
    setUntrackedSkills(untracked)
    setAvailableSkills(available)
    const installedSkillNames = installed.map((s) => s.name)
    setHarnesses(getHarnessesInfo(projectPath, installedSkillNames))

    const newRows = buildSkillRows(installed, untracked, available)

    if (selectSkillName) {
      const skillIndex = findSkillIndex(newRows, selectSkillName)
      if (skillIndex >= 0) {
        setSelectedIndex(skillIndex)
        return
      }
    }

    setSelectedIndex((i) => Math.min(i, Math.max(0, newRows.length - 1)))
  }, [projectPath])

  useEffect(() => {
    void loadData()
  }, [loadData])

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
