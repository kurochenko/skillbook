import { existsSync, mkdirSync, readdirSync, rmSync } from 'fs'
import { join } from 'path'
import { getLibraryPath } from '@/lib/paths'
import { runGit } from '@/lib/git'
import { SKILL_FILE, SKILLS_DIR, SKILLBOOK_DIR } from '@/constants'

export type SparseCheckoutResult =
  | { success: true }
  | { success: false; error: string }

const BASE_PATTERNS = ['/*', '!/skills']

const getSkillbookPath = (projectPath: string): string =>
  join(projectPath, SKILLBOOK_DIR)

export const getSkillbookSkillsPath = (projectPath: string): string =>
  join(getSkillbookPath(projectPath), SKILLS_DIR)

export const isSkillbookInitialized = (projectPath: string): boolean => {
  const skillbookPath = getSkillbookPath(projectPath)
  return existsSync(skillbookPath) && existsSync(join(skillbookPath, '.git'))
}

const readSparsePatterns = async (skillbookPath: string): Promise<string[]> => {
  const result = await runGit(skillbookPath, ['sparse-checkout', 'list'])
  return result.success ? result.output.split('\n').filter(Boolean) : []
}

const writeSparsePatterns = async (
  skillbookPath: string,
  patterns: string[],
): Promise<SparseCheckoutResult> => {
  const result = await runGit(skillbookPath, ['sparse-checkout', 'set', '--no-cone', ...patterns])
  if (!result.success) {
    return { success: false, error: `Failed to set sparse-checkout: ${result.error}` }
  }
  return { success: true }
}

export const initSparseCheckout = async (projectPath: string): Promise<SparseCheckoutResult> => {
  const skillbookPath = getSkillbookPath(projectPath)
  const libraryPath = getLibraryPath()

  if (!existsSync(libraryPath)) {
    return { success: false, error: 'Library not found. Run `skillbook scan` first to create it.' }
  }

  if (isSkillbookInitialized(projectPath)) {
    return { success: true }
  }

  if (existsSync(skillbookPath)) {
    rmSync(skillbookPath, { recursive: true, force: true })
  }

  const cloneResult = await runGit(projectPath, [
    'clone',
    '--filter=blob:none',
    '--sparse',
    '--no-checkout',
    libraryPath,
    SKILLBOOK_DIR,
  ])
  if (!cloneResult.success) {
    return { success: false, error: `Failed to clone library: ${cloneResult.error}` }
  }

  const sparseInitResult = await runGit(skillbookPath, ['sparse-checkout', 'init', '--cone'])
  if (!sparseInitResult.success) {
    return { success: false, error: `Failed to init sparse-checkout: ${sparseInitResult.error}` }
  }

  const sparseSetResult = await writeSparsePatterns(skillbookPath, BASE_PATTERNS)
  if (!sparseSetResult.success) {
    return sparseSetResult
  }

  const checkoutResult = await runGit(skillbookPath, ['checkout'])
  if (!checkoutResult.success) {
    return { success: false, error: `Failed to checkout: ${checkoutResult.error}` }
  }

  const skillsPath = getSkillbookSkillsPath(projectPath)
  if (!existsSync(skillsPath)) {
    mkdirSync(skillsPath, { recursive: true })
  }

  return { success: true }
}

export const addToSparseCheckout = async (
  projectPath: string,
  skillName: string,
): Promise<SparseCheckoutResult> => {
  const skillbookPath = getSkillbookPath(projectPath)

  if (!isSkillbookInitialized(projectPath)) {
    return { success: false, error: 'Skillbook not initialized. Run init first.' }
  }

  const currentPatterns = await readSparsePatterns(skillbookPath)
  const skillPattern = `skills/${skillName}`

  if (currentPatterns.includes(skillPattern)) {
    return { success: true }
  }

  return writeSparsePatterns(skillbookPath, [...currentPatterns, skillPattern])
}

export const removeFromSparseCheckout = async (
  projectPath: string,
  skillName: string,
): Promise<SparseCheckoutResult> => {
  const skillbookPath = getSkillbookPath(projectPath)

  if (!isSkillbookInitialized(projectPath)) {
    return { success: false, error: 'Skillbook not initialized.' }
  }

  const currentPatterns = await readSparsePatterns(skillbookPath)
  const skillPattern = `skills/${skillName}`
  const newPatterns = currentPatterns.filter((p) => p !== skillPattern)

  if (newPatterns.length === currentPatterns.length) {
    return { success: true }
  }

  const patternsToSet = newPatterns.length > 0 ? newPatterns : BASE_PATTERNS
  return writeSparsePatterns(skillbookPath, patternsToSet)
}

export const getSparseCheckoutSkills = (projectPath: string): string[] => {
  const skillsPath = getSkillbookSkillsPath(projectPath)

  if (!existsSync(skillsPath)) {
    return []
  }

  try {
    return readdirSync(skillsPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => existsSync(join(skillsPath, entry.name, SKILL_FILE)))
      .map((entry) => entry.name)
      .sort()
  } catch {
    return []
  }
}
