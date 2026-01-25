import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, dirname, resolve, basename } from 'path'
import {
  detectHarnesses,
  getEnabledHarnesses,
  getHarnessBaseDir,
} from '@/lib/harness'
import {
  getSkillContent,
  listSkills as listLibrarySkills,
  addSkillToLibrary,
  calculateDiff,
  type DiffStats,
} from '@/lib/library'
import { SKILL_FILE, TOOLS, type ToolId } from '@/constants'
import {
  isSkillbookInitialized,
  initSparseCheckout,
  addToSparseCheckout,
  removeFromSparseCheckout,
  getSkillbookSkillsPath,
} from '@/lib/sparse-checkout'
import {
  isSkillSymlinked,
  createSymlinksForSkill,
  removeSymlinksForSkill,
  convertToSymlink,
} from '@/lib/symlinks'

// Sync status for skills (displayed in TUI)
//
// For symlinked skills (managed by skillbook):
// - 'ok': symlink to .skillbook, content matches library
// - 'ahead': symlink to .skillbook, local changes to push
// - 'behind': symlink to .skillbook, library has updates to pull
//
// For real files (not yet managed by skillbook):
// - 'detached': real file matches library content (safe to sync)
// - 'conflict': real file differs from library (needs review)
export type SkillSyncStatus = 'ok' | 'ahead' | 'behind' | 'detached' | 'conflict'

// Harness-level status (only ok/detached/conflict - ahead/behind are skill-level)
export type HarnessSkillStatus = 'ok' | 'detached' | 'conflict'

// Per-harness information for a skill
export type HarnessSkillInfo = {
  harnessId: ToolId
  status: HarnessSkillStatus
  content: string
  diff: DiffStats | null  // Only set for 'conflict' status
}

export type InstalledSkill = {
  name: string
  status: SkillSyncStatus           // Overall skill status (unanimous or derived)
  harnesses: HarnessSkillInfo[]     // Per-harness details
  isUnanimous: boolean              // True if all harnesses have same status
  diff: DiffStats | null            // Overall diff (for skill-level display)
  content: string                   // Content from first harness (for backward compat)
}

// Info about which harnesses contain an untracked skill
export type UntrackedHarnessInfo = {
  harnessId: ToolId
  content: string
}

export type UntrackedSkill = {
  name: string
  harnesses: UntrackedHarnessInfo[]  // Which harnesses have this skill
  content: string                     // Content from first harness (for backward compat)
}

export type AvailableSkill = {
  name: string
}

// Result type for skill actions (install, uninstall, push, sync)
// Lib layer returns structured results; CLI/TUI decides how to present errors
export type SkillActionResult =
  | { success: true }
  | { success: false; error: string }

/**
 * Detect if we're in a project context.
 * Returns project root if found, null otherwise.
 *
 * A project is detected by presence of:
 * - .git folder
 * - .skillbook folder
 * - Any harness folder (.claude, .cursor, .opencode)
 */
export const detectProjectContext = (startPath: string = process.cwd()): string | null => {
  let current = resolve(startPath)
  const root = '/'

  while (current !== root) {
    // Check for project indicators
    if (
      existsSync(join(current, '.git')) ||
      existsSync(join(current, '.skillbook')) ||
      existsSync(join(current, '.claude')) ||
      existsSync(join(current, '.cursor')) ||
      existsSync(join(current, '.opencode'))
    ) {
      return current
    }

    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }

  return null
}

/**
 * Get the path to a skill file in .skillbook/skills/
 */
const getProjectSkillPath = (projectPath: string, skillName: string): string => {
  return join(getSkillbookSkillsPath(projectPath), skillName, SKILL_FILE)
}

/**
 * Read skill content from project's .skillbook/skills/ directory
 * (Internal helper - not exported)
 */
const getProjectSkillContent = (projectPath: string, skillName: string): string | null => {
  const skillPath = getProjectSkillPath(projectPath, skillName)

  if (!existsSync(skillPath)) {
    return null
  }

  try {
    return readFileSync(skillPath, 'utf-8')
  } catch {
    return null
  }
}

// Use getHarnessBaseDir from harness.ts for harness path logic

/**
 * Scan a harness directory for skills
 */
const scanHarnessForSkills = (
  projectPath: string,
  harnessId: ToolId,
): { name: string; content: string; path: string }[] => {
  const skillsDir = getHarnessBaseDir(projectPath, harnessId)
  if (!existsSync(skillsDir)) return []

  const tool = TOOLS[harnessId]
  const results: { name: string; content: string; path: string }[] = []

  try {
    const entries = readdirSync(skillsDir, { withFileTypes: true })

    if (tool.needsDirectory) {
      // Directory-based harness (claude-code, opencode)
      // Note: entry might be a directory OR a symlink to a directory
      for (const entry of entries) {
        const entryPath = join(skillsDir, entry.name)
        
        // Check if it's a directory or symlink to directory
        let isDir = entry.isDirectory()
        if (!isDir && entry.isSymbolicLink()) {
          try {
            isDir = statSync(entryPath).isDirectory()
          } catch {
            // Broken symlink - skip this entry
            continue
          }
        }
        if (!isDir) continue

        const skillPath = join(skillsDir, entry.name, SKILL_FILE)
        if (!existsSync(skillPath)) continue

        const content = readFileSync(skillPath, 'utf-8')
        results.push({ name: entry.name, content, path: skillPath })
      }
    } else {
      // Flat file harness (cursor)
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue

        const skillPath = join(skillsDir, entry.name)
        const name = basename(entry.name, '.md')
        const content = readFileSync(skillPath, 'utf-8')
        results.push({ name, content, path: skillPath })
      }
    }
  } catch {
    // ignore errors
  }

  return results
}

/**
 * Get harness-level status for a skill in a specific harness.
 */
const getHarnessSkillStatus = (
  projectPath: string,
  harnessId: ToolId,
  skillName: string,
  content: string,
  libraryContent: string,
): HarnessSkillInfo => {
  const symlinked = isSkillSymlinked(projectPath, harnessId, skillName)

  let status: HarnessSkillStatus
  let diff: DiffStats | null = null

  if (symlinked) {
    status = 'ok'
  } else if (content === libraryContent) {
    status = 'detached'
  } else {
    status = 'conflict'
    diff = calculateDiff(libraryContent, content)
  }

  return { harnessId, status, content, diff }
}

/**
 * Derive overall skill status from per-harness statuses.
 * - If all symlinked and content matches library: 'ok'
 * - If all symlinked but content differs: 'ahead' (local changes)
 * - If all harnesses have same real-file status: that status (detached/conflict)
 * - If mixed: use the "worst" status (conflict > detached > ok)
 */
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

  // Check if all symlinked (ok status at harness level)
  const allSymlinked = harnesses.every((h) => h.status === 'ok')
  if (allSymlinked) {
    // All symlinked - check if content matches library
    if (firstHarness.content === libraryContent) {
      return { status: 'ok', isUnanimous: true, diff: null }
    } else {
      // Symlinked but content differs from library = ahead
      const diff = calculateDiff(libraryContent, firstHarness.content)
      return { status: 'ahead', isUnanimous: true, diff }
    }
  }

  // Not all symlinked - determine status based on harness statuses
  if (isUnanimous) {
    const status = firstHarness.status as SkillSyncStatus
    const diff = firstHarness.diff
    return { status, isUnanimous: true, diff }
  }

  // Mixed statuses - use worst (conflict > detached > ok)
  if (statuses.has('conflict')) {
    const conflictHarness = harnesses.find((h) => h.status === 'conflict')
    return { status: 'conflict', isUnanimous: false, diff: conflictHarness?.diff ?? null }
  }
  if (statuses.has('detached')) {
    return { status: 'detached', isUnanimous: false, diff: null }
  }
  return { status: 'ok', isUnanimous: false, diff: null }
}

/**
 * Get all installed skills with per-harness status information.
 * Scans harness folders and determines sync status for each harness.
 * 
 * Note: Skills NOT in library go to getUntrackedSkills() instead.
 */
export const getInstalledSkills = (projectPath: string): InstalledSkill[] => {
  const skillMap = new Map<string, HarnessSkillInfo[]>()
  const skillContent = new Map<string, string>()  // First content seen
  const detectedHarnesses = detectHarnesses(projectPath)

  // Collect per-harness info for each skill
  for (const harnessId of detectedHarnesses) {
    const harnessSkills = scanHarnessForSkills(projectPath, harnessId)

    for (const { name, content } of harnessSkills) {
      const libraryContent = getSkillContent(name)
      
      // Only "installed" if it's in the library
      if (libraryContent === null) continue

      const harnessInfo = getHarnessSkillStatus(projectPath, harnessId, name, content, libraryContent)

      if (!skillMap.has(name)) {
        skillMap.set(name, [])
        skillContent.set(name, content)
      }
      skillMap.get(name)!.push(harnessInfo)
    }
  }

  // Build InstalledSkill array
  const skills: InstalledSkill[] = []
  for (const [name, harnesses] of skillMap) {
    const libraryContent = getSkillContent(name)!
    const { status, isUnanimous, diff } = deriveSkillStatus(harnesses, libraryContent)
    const content = skillContent.get(name)!

    skills.push({ name, status, harnesses, isUnanimous, diff, content })
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Get skills that exist in harness folders but are NOT in the library.
 * These are "untracked" - local skills that haven't been pushed to the library yet.
 */
export const getUntrackedSkills = (projectPath: string): UntrackedSkill[] => {
  const skillMap = new Map<string, UntrackedHarnessInfo[]>()
  const skillContent = new Map<string, string>()

  // Check all harness folders for skills NOT in the library
  const detectedHarnesses = detectHarnesses(projectPath)

  for (const harnessId of detectedHarnesses) {
    const harnessSkills = scanHarnessForSkills(projectPath, harnessId)

    for (const { name, content } of harnessSkills) {
      const libraryContent = getSkillContent(name)

      // Only "untracked" if NOT in library
      if (libraryContent !== null) continue

      if (!skillMap.has(name)) {
        skillMap.set(name, [])
        skillContent.set(name, content)
      }
      skillMap.get(name)!.push({ harnessId, content })
    }
  }

  // Build UntrackedSkill array
  const skills: UntrackedSkill[] = []
  for (const [name, harnesses] of skillMap) {
    const content = skillContent.get(name)!
    skills.push({ name, harnesses, content })
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Get skills available in library but not installed in project.
 * Pass installedSkills to avoid re-scanning if you already have them.
 */
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

/**
 * Install a skill from library to project.
 * Uses sparse checkout + symlinks:
 * 1. Init .skillbook if needed (lazy init)
 * 2. Add skill to sparse checkout
 * 3. Create symlinks in enabled harnesses
 */
export const installSkill = async (projectPath: string, skillName: string): Promise<SkillActionResult> => {
  const libraryContent = getSkillContent(skillName)

  if (libraryContent === null) {
    return { success: false, error: 'Skill not found in library' }
  }

  // Lazy init: if .skillbook not initialized, init it now
  if (!isSkillbookInitialized(projectPath)) {
    const initResult = await initSparseCheckout(projectPath)
    if (!initResult.success) {
      return { success: false, error: `Failed to init skillbook: ${initResult.error}` }
    }
  }

  // Add skill to sparse checkout
  const addResult = await addToSparseCheckout(projectPath, skillName)
  if (!addResult.success) {
    return { success: false, error: `Failed to add to sparse checkout: ${addResult.error}` }
  }

  // Create symlinks in enabled harnesses
  const harnesses = getEnabledHarnesses(projectPath)
  const symlinkResult = createSymlinksForSkill(projectPath, harnesses, skillName)
  if (!symlinkResult.success) {
    return { success: false, error: `Failed to create symlinks: ${symlinkResult.error}` }
  }

  return { success: true }
}

/**
 * Uninstall a skill from project.
 * 1. Remove symlinks from all harnesses
 * 2. Remove from sparse checkout
 */
export const uninstallSkill = async (projectPath: string, skillName: string): Promise<SkillActionResult> => {
  // Remove symlinks from all harnesses (not just enabled ones)
  const allHarnesses = detectHarnesses(projectPath)
  const symlinkResult = removeSymlinksForSkill(projectPath, allHarnesses, skillName)
  // Note: symlink removal failure is non-fatal (might be real files)
  const symlinkWarning = !symlinkResult.success ? symlinkResult.error : null

  // Remove from sparse checkout (if skillbook is initialized)
  if (isSkillbookInitialized(projectPath)) {
    const removeResult = await removeFromSparseCheckout(projectPath, skillName)
    if (!removeResult.success) {
      return { success: false, error: `Failed to remove from sparse checkout: ${removeResult.error}` }
    }
  }

  // Return success even if symlink removal failed (non-fatal warning)
  if (symlinkWarning) {
    // Could extend SkillActionResult to include warnings, but for now just succeed
  }

  return { success: true }
}

/**
 * Push a skill from project to library
 * Used for untracked skills or updated installed skills
 */
export const pushSkillToLibrary = async (
  projectPath: string,
  skillName: string,
): Promise<SkillActionResult> => {
  // First check .skillbook/skills/
  let content = getProjectSkillContent(projectPath, skillName)

  // If not in .skillbook/skills/, check harness folders
  if (content === null) {
    const claudeSkillPath = join(projectPath, '.claude', 'skills', skillName, SKILL_FILE)
    if (existsSync(claudeSkillPath)) {
      content = readFileSync(claudeSkillPath, 'utf-8')
    }
  }

  if (content === null) {
    return { success: false, error: 'Skill content not found in project' }
  }

  const result = await addSkillToLibrary(skillName, content)
  if (!result.success) {
    return { success: false, error: result.error }
  }

  return { success: true }
}

/**
 * Sync a skill from library to project.
 * For unsynced skills: converts real files to symlinks.
 * 1. Init .skillbook if needed (lazy init)
 * 2. Add skill to sparse checkout
 * 3. Convert real files in harnesses to symlinks
 */
export const syncSkillFromLibrary = async (projectPath: string, skillName: string): Promise<SkillActionResult> => {
  const libraryContent = getSkillContent(skillName)

  if (libraryContent === null) {
    return { success: false, error: 'Skill not found in library' }
  }

  // Lazy init: if .skillbook not initialized, init it now
  if (!isSkillbookInitialized(projectPath)) {
    const initResult = await initSparseCheckout(projectPath)
    if (!initResult.success) {
      return { success: false, error: `Failed to init skillbook: ${initResult.error}` }
    }
  }

  // Add skill to sparse checkout
  const addResult = await addToSparseCheckout(projectPath, skillName)
  if (!addResult.success) {
    return { success: false, error: `Failed to add to sparse checkout: ${addResult.error}` }
  }

  // Convert real files to symlinks in all detected harnesses
  // Collect any failures but continue with other harnesses
  const harnesses = detectHarnesses(projectPath)
  const failures: string[] = []
  for (const harnessId of harnesses) {
    const result = convertToSymlink(projectPath, harnessId, skillName)
    if (!result.success) {
      failures.push(`${harnessId}: ${result.error}`)
    }
  }

  // Return success even if some harness conversions failed (partial success)
  // Could extend to return warnings if needed
  return { success: true }
}


