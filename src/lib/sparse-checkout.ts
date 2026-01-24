import { existsSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'
import { getLibraryPath } from './paths.ts'
import { SKILL_FILE } from '../constants.ts'

export type SparseCheckoutResult =
  | { success: true }
  | { success: false; error: string }

const SKILLBOOK_DIR = '.skillbook'
const SKILLS_DIR = 'skills'

/**
 * Get the .skillbook directory path for a project
 */
export const getSkillbookPath = (projectPath: string): string => {
  return join(projectPath, SKILLBOOK_DIR)
}

/**
 * Get the skills directory inside .skillbook
 */
export const getSkillbookSkillsPath = (projectPath: string): string => {
  return join(getSkillbookPath(projectPath), SKILLS_DIR)
}

/**
 * Get the full path to a skill inside .skillbook/skills/
 */
export const getSkillbookSkillPath = (projectPath: string, skillName: string): string => {
  return join(getSkillbookSkillsPath(projectPath), skillName, SKILL_FILE)
}

/**
 * Run a git command in a directory
 */
const runGit = async (
  dir: string,
  args: string[],
): Promise<{ success: boolean; output: string; error: string }> => {
  try {
    const proc = Bun.spawn(['git', ...args], {
      cwd: dir,
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const exitCode = await proc.exited
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()

    return {
      success: exitCode === 0,
      output: stdout.trim(),
      error: stderr.trim(),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, output: '', error: message }
  }
}

/**
 * Check if .skillbook is initialized as a sparse checkout of the library
 */
export const isSkillbookInitialized = (projectPath: string): boolean => {
  const skillbookPath = getSkillbookPath(projectPath)

  // Must exist
  if (!existsSync(skillbookPath)) return false

  // Must be a git repo
  if (!existsSync(join(skillbookPath, '.git'))) return false

  return true
}

/**
 * Initialize .skillbook as a sparse checkout of the library.
 * This clones the library repo with sparse checkout enabled.
 */
export const initSparseCheckout = async (projectPath: string): Promise<SparseCheckoutResult> => {
  const skillbookPath = getSkillbookPath(projectPath)
  const libraryPath = getLibraryPath()

  // Check if library exists
  if (!existsSync(libraryPath)) {
    return { success: false, error: 'Library not found. Run `skillbook scan` first to create it.' }
  }

  // Check if already initialized
  if (isSkillbookInitialized(projectPath)) {
    return { success: true }
  }

  // Remove existing .skillbook if it's not a valid sparse checkout
  if (existsSync(skillbookPath)) {
    const { rmSync } = await import('fs')
    rmSync(skillbookPath, { recursive: true, force: true })
  }

  // Clone with sparse checkout
  // Using --no-checkout so we can set up sparse-checkout before checking out files
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

  // Set sparse-checkout to cone mode and initialize with empty set
  const sparseInitResult = await runGit(skillbookPath, [
    'sparse-checkout',
    'init',
    '--cone',
  ])

  if (!sparseInitResult.success) {
    return { success: false, error: `Failed to init sparse-checkout: ${sparseInitResult.error}` }
  }

  // Set to only include the base (no skills yet)
  // This creates an almost empty checkout - just root files
  const sparseSetResult = await runGit(skillbookPath, [
    'sparse-checkout',
    'set',
    '--no-cone',
    '/*',
    '!/skills',
  ])

  if (!sparseSetResult.success) {
    return { success: false, error: `Failed to set sparse-checkout: ${sparseSetResult.error}` }
  }

  // Now checkout
  const checkoutResult = await runGit(skillbookPath, ['checkout'])

  if (!checkoutResult.success) {
    return { success: false, error: `Failed to checkout: ${checkoutResult.error}` }
  }

  // Create empty skills directory
  const skillsPath = getSkillbookSkillsPath(projectPath)
  if (!existsSync(skillsPath)) {
    mkdirSync(skillsPath, { recursive: true })
  }

  return { success: true }
}

/**
 * Add a skill to the sparse checkout.
 * This makes the skill's directory appear in .skillbook/skills/
 */
export const addToSparseCheckout = async (
  projectPath: string,
  skillName: string,
): Promise<SparseCheckoutResult> => {
  const skillbookPath = getSkillbookPath(projectPath)

  if (!isSkillbookInitialized(projectPath)) {
    return { success: false, error: 'Skillbook not initialized. Run init first.' }
  }

  // Get current sparse-checkout patterns
  const listResult = await runGit(skillbookPath, ['sparse-checkout', 'list'])
  const currentPatterns = listResult.success
    ? listResult.output.split('\n').filter(Boolean)
    : []

  // Add the skill path pattern
  const skillPattern = `skills/${skillName}`
  if (currentPatterns.includes(skillPattern)) {
    return { success: true } // Already included
  }

  // Add the new pattern
  const newPatterns = [...currentPatterns, skillPattern]
  const setResult = await runGit(skillbookPath, [
    'sparse-checkout',
    'set',
    '--no-cone',
    ...newPatterns,
  ])

  if (!setResult.success) {
    return { success: false, error: `Failed to add to sparse-checkout: ${setResult.error}` }
  }

  return { success: true }
}

/**
 * Remove a skill from the sparse checkout.
 */
export const removeFromSparseCheckout = async (
  projectPath: string,
  skillName: string,
): Promise<SparseCheckoutResult> => {
  const skillbookPath = getSkillbookPath(projectPath)

  if (!isSkillbookInitialized(projectPath)) {
    return { success: false, error: 'Skillbook not initialized.' }
  }

  // Get current sparse-checkout patterns
  const listResult = await runGit(skillbookPath, ['sparse-checkout', 'list'])
  if (!listResult.success) {
    return { success: false, error: `Failed to list sparse-checkout: ${listResult.error}` }
  }

  const currentPatterns = listResult.output.split('\n').filter(Boolean)
  const skillPattern = `skills/${skillName}`

  // Remove the skill pattern
  const newPatterns = currentPatterns.filter((p) => p !== skillPattern)

  if (newPatterns.length === currentPatterns.length) {
    return { success: true } // Wasn't in sparse-checkout anyway
  }

  // Ensure we have at least one pattern (git requires it)
  if (newPatterns.length === 0) {
    newPatterns.push('/*')
  }

  const setResult = await runGit(skillbookPath, [
    'sparse-checkout',
    'set',
    '--no-cone',
    ...newPatterns,
  ])

  if (!setResult.success) {
    return { success: false, error: `Failed to update sparse-checkout: ${setResult.error}` }
  }

  return { success: true }
}

/**
 * Get list of skills currently in the sparse checkout.
 * Reads from filesystem rather than sparse-checkout config for accuracy.
 */
export const getSparseCheckoutSkills = (projectPath: string): string[] => {
  const skillsPath = getSkillbookSkillsPath(projectPath)

  if (!existsSync(skillsPath)) {
    return []
  }

  try {
    const entries = readdirSync(skillsPath, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory())
      .filter((entry) => existsSync(join(skillsPath, entry.name, SKILL_FILE)))
      .map((entry) => entry.name)
      .sort()
  } catch {
    return []
  }
}

/**
 * Pull latest changes from library into sparse checkout.
 */
export const pullFromLibrary = async (projectPath: string): Promise<SparseCheckoutResult> => {
  const skillbookPath = getSkillbookPath(projectPath)

  if (!isSkillbookInitialized(projectPath)) {
    return { success: false, error: 'Skillbook not initialized.' }
  }

  const pullResult = await runGit(skillbookPath, ['pull', '--rebase'])

  if (!pullResult.success) {
    return { success: false, error: `Failed to pull: ${pullResult.error}` }
  }

  return { success: true }
}

/**
 * Get the content of a skill from the sparse checkout.
 */
export const getSkillbookSkillContent = (projectPath: string, skillName: string): string | null => {
  const skillPath = getSkillbookSkillPath(projectPath, skillName)

  if (!existsSync(skillPath)) {
    return null
  }

  try {
    const { readFileSync } = require('fs')
    return readFileSync(skillPath, 'utf-8')
  } catch {
    return null
  }
}
