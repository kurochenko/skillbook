import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, dirname, resolve, basename } from 'path'
import { detectHarnesses, getHarnessBaseDir } from '@/lib/harness'
import {
  getSkillContent,
  listSkills as listLibrarySkills,
  calculateDiff,
  type DiffStats,
} from '@/lib/library'
import { SKILL_FILE, TOOLS, type ToolId } from '@/constants'
import { isSkillSymlinked } from '@/lib/symlinks'

export type SkillSyncStatus = 'ok' | 'ahead' | 'behind' | 'detached' | 'conflict'
export type HarnessSkillStatus = 'ok' | 'detached' | 'conflict'

export type HarnessSkillInfo = {
  harnessId: ToolId
  status: HarnessSkillStatus
  content: string
  diff: DiffStats | null
}

export type InstalledSkill = {
  name: string
  status: SkillSyncStatus
  harnesses: HarnessSkillInfo[]
  isUnanimous: boolean
  diff: DiffStats | null
  content: string
}

export type UntrackedHarnessInfo = {
  harnessId: ToolId
  content: string
}

export type UntrackedSkill = {
  name: string
  harnesses: UntrackedHarnessInfo[]
  content: string
}

export type AvailableSkill = {
  name: string
}

export type ProjectSkills = {
  installed: InstalledSkill[]
  untracked: UntrackedSkill[]
}

type ScannedSkill = {
  name: string
  content: string
  path: string
  harnessId: ToolId
}

const PROJECT_INDICATORS = ['.git', '.skillbook', '.claude', '.cursor', '.opencode']

export const detectProjectContext = (startPath: string = process.cwd()): string | null => {
  let current = resolve(startPath)
  const root = '/'

  while (current !== root) {
    for (const indicator of PROJECT_INDICATORS) {
      if (existsSync(join(current, indicator))) {
        return current
      }
    }
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }

  return null
}

const readFileSafe = (path: string): string | null => {
  try {
    return readFileSync(path, 'utf-8')
  } catch {
    return null
  }
}

const scanHarnessForSkills = (projectPath: string, harnessId: ToolId): ScannedSkill[] => {
  const skillsDir = getHarnessBaseDir(projectPath, harnessId)
  if (!existsSync(skillsDir)) return []

  const tool = TOOLS[harnessId]
  const results: ScannedSkill[] = []

  let entries: string[]
  try {
    entries = readdirSync(skillsDir)
  } catch {
    return []
  }

  if (tool.needsDirectory) {
    for (const name of entries) {
      const entryPath = join(skillsDir, name)

      let isDir: boolean
      try {
        const stat = statSync(entryPath)
        isDir = stat.isDirectory()
      } catch {
        continue
      }
      if (!isDir) continue

      const skillPath = join(skillsDir, name, SKILL_FILE)
      const content = readFileSafe(skillPath)
      if (content !== null) {
        results.push({ name, content, path: skillPath, harnessId })
      }
    }
  } else {
    for (const name of entries) {
      if (!name.endsWith('.md')) continue

      const skillPath = join(skillsDir, name)
      const content = readFileSafe(skillPath)
      if (content !== null) {
        const skillName = basename(name, '.md')
        results.push({ name: skillName, content, path: skillPath, harnessId })
      }
    }
  }

  return results
}

const scanAllHarnesses = (projectPath: string): ScannedSkill[] => {
  const harnesses = detectHarnesses(projectPath)
  return harnesses.flatMap((harnessId) => scanHarnessForSkills(projectPath, harnessId))
}

const getHarnessSkillStatus = (
  projectPath: string,
  harnessId: ToolId,
  skillName: string,
  content: string,
  libraryContent: string,
): HarnessSkillInfo => {
  const symlinked = isSkillSymlinked(projectPath, harnessId, skillName)

  if (symlinked) {
    return { harnessId, status: 'ok', content, diff: null }
  }

  if (content === libraryContent) {
    return { harnessId, status: 'detached', content, diff: null }
  }

  return {
    harnessId,
    status: 'conflict',
    content,
    diff: calculateDiff(libraryContent, content),
  }
}

const deriveSkillStatus = (
  harnesses: HarnessSkillInfo[],
  libraryContent: string,
): { status: SkillSyncStatus; isUnanimous: boolean; diff: DiffStats | null } => {
  if (harnesses.length === 0) {
    return { status: 'ok', isUnanimous: true, diff: null }
  }

  const statuses = new Set(harnesses.map((h) => h.status))
  const isUnanimous = statuses.size === 1
  const firstHarness = harnesses[0]!

  const allSymlinked = harnesses.every((h) => h.status === 'ok')
  if (allSymlinked) {
    if (firstHarness.content === libraryContent) {
      return { status: 'ok', isUnanimous: true, diff: null }
    }
    return {
      status: 'ahead',
      isUnanimous: true,
      diff: calculateDiff(libraryContent, firstHarness.content),
    }
  }

  if (isUnanimous) {
    return { status: firstHarness.status, isUnanimous: true, diff: firstHarness.diff }
  }

  if (statuses.has('conflict')) {
    const conflictHarness = harnesses.find((h) => h.status === 'conflict')
    return { status: 'conflict', isUnanimous: false, diff: conflictHarness?.diff ?? null }
  }

  if (statuses.has('detached')) {
    return { status: 'detached', isUnanimous: false, diff: null }
  }

  return { status: 'ok', isUnanimous: false, diff: null }
}

const getLibraryContentMap = (skills: ScannedSkill[]): Map<string, string | null> => {
  const map = new Map<string, string | null>()
  for (const skill of skills) {
    if (!map.has(skill.name)) {
      map.set(skill.name, getSkillContent(skill.name))
    }
  }
  return map
}

const partitionScannedSkills = (
  projectPath: string,
  scannedSkills: ScannedSkill[],
): ProjectSkills => {
  const libraryContentMap = getLibraryContentMap(scannedSkills)
  const installedMap = new Map<string, {
    harnesses: HarnessSkillInfo[]
    content: string
    libraryContent: string
  }>()
  const untrackedMap = new Map<string, { harnesses: UntrackedHarnessInfo[]; content: string }>()

  for (const skill of scannedSkills) {
    const libraryContent = libraryContentMap.get(skill.name) ?? null

    if (libraryContent !== null) {
      const existing = installedMap.get(skill.name)
      const harnessInfo = getHarnessSkillStatus(
        projectPath,
        skill.harnessId,
        skill.name,
        skill.content,
        libraryContent,
      )

      if (existing) {
        existing.harnesses.push(harnessInfo)
      } else {
        installedMap.set(skill.name, {
          harnesses: [harnessInfo],
          content: skill.content,
          libraryContent,
        })
      }
    } else {
      const existing = untrackedMap.get(skill.name)
      const harnessInfo: UntrackedHarnessInfo = {
        harnessId: skill.harnessId,
        content: skill.content,
      }

      if (existing) {
        existing.harnesses.push(harnessInfo)
      } else {
        untrackedMap.set(skill.name, { harnesses: [harnessInfo], content: skill.content })
      }
    }
  }

  const installed: InstalledSkill[] = []
  for (const [name, data] of installedMap) {
    const { status, isUnanimous, diff } = deriveSkillStatus(data.harnesses, data.libraryContent)
    installed.push({
      name,
      status,
      harnesses: data.harnesses,
      isUnanimous,
      diff,
      content: data.content,
    })
  }

  const untracked: UntrackedSkill[] = []
  for (const [name, data] of untrackedMap) {
    untracked.push({ name, harnesses: data.harnesses, content: data.content })
  }

  return {
    installed: installed.sort((a, b) => a.name.localeCompare(b.name)),
    untracked: untracked.sort((a, b) => a.name.localeCompare(b.name)),
  }
}

export const getProjectSkills = (projectPath: string): ProjectSkills => {
  const scanned = scanAllHarnesses(projectPath)
  return partitionScannedSkills(projectPath, scanned)
}

export const getInstalledSkills = (projectPath: string): InstalledSkill[] => {
  return getProjectSkills(projectPath).installed
}

export const getUntrackedSkills = (projectPath: string): UntrackedSkill[] => {
  return getProjectSkills(projectPath).untracked
}

export const getAvailableSkills = (
  projectPath: string,
  installedSkills?: InstalledSkill[],
): AvailableSkill[] => {
  const librarySkills = listLibrarySkills()
  const installed = installedSkills ?? getInstalledSkills(projectPath)
  const installedNames = new Set(installed.map((s) => s.name))

  return librarySkills
    .filter((name) => !installedNames.has(name))
    .map((name) => ({ name }))
}
