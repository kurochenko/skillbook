import { existsSync, mkdirSync, readdirSync, rmSync } from 'fs'
import { join } from 'path'
import { getLibraryPath } from '@/lib/paths'
import { runGit, gitPull, gitStashPush, gitStashPop, checkOriginStatus, getRemoteUrl } from '@/lib/git'
import { SKILL_FILE, SKILLS_DIR, SKILLBOOK_DIR } from '@/constants'
import { isIgnoredFsError, logError } from '@/lib/logger'

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

const refreshSparseCheckout = async (
  skillbookPath: string,
  skillName: string,
): Promise<SparseCheckoutResult> => {
  const skillPath = `${SKILLS_DIR}/${skillName}`
  const originStatus = await checkOriginStatus(skillbookPath)

  if (originStatus.status === 'behind') {
    const statusResult = await runGit(skillbookPath, ['status', '--porcelain'])
    const isDirty = statusResult.success && statusResult.output.length > 0

    if (isDirty) {
      const stashResult = await gitStashPush(skillbookPath, `Auto-stash before sync ${skillName}`)
      const pullResult = await gitPull(skillbookPath, true)

      if (!pullResult.success) {
        if (stashResult.success) {
          await gitStashPop(skillbookPath)
        }
        return { success: false, error: `Library is behind origin by ${originStatus.commits} commits and cannot fast-forward. Please resolve manually in ~/.skillbook.` }
      }

      if (stashResult.success) {
        const popResult = await gitStashPop(skillbookPath)
        if (!popResult.success) {
          return { success: false, error: `Pulled from origin but failed to restore stashed changes: ${popResult.error}. Run 'git stash pop' in ~/.skillbook to recover.` }
        }
        const checkoutResult = await runGit(skillbookPath, ['checkout', 'HEAD', '--', skillPath])
        if (!checkoutResult.success) {
          return { success: false, error: `Failed to apply pulled version: ${checkoutResult.error}` }
        }
      }
    } else {
      const pullResult = await gitPull(skillbookPath, true)
      if (!pullResult.success) {
        return { success: false, error: `Failed to pull from origin: ${pullResult.error}` }
      }
    }
  }

  if (originStatus.status === 'diverged') {
    return { success: false, error: `Library has diverged from origin (${originStatus.ahead} ahead, ${originStatus.behind} behind). Manual merge required in ~/.skillbook.` }
  }

  if (originStatus.status === 'error') {
    return { success: false, error: `Failed to check origin status: ${originStatus.error}` }
  }

  const skillStatus = await runGit(skillbookPath, ['status', '--porcelain', '--', skillPath])
  if (!skillStatus.success) {
    return { success: false, error: `Failed to check skill status: ${skillStatus.error}` }
  }
  if (skillStatus.output.length > 0) {
    return { success: false, error: `Local changes in ${skillPath} prevent update` }
  }

  const fileExists = existsSync(join(skillbookPath, skillPath, SKILL_FILE))
  if (!fileExists) {
    const reapplyResult = await runGit(skillbookPath, ['sparse-checkout', 'reapply'])
    if (!reapplyResult.success) {
      return { success: false, error: `Failed to reapply sparse-checkout: ${reapplyResult.error}` }
    }
  }

  const stillMissing = !existsSync(join(skillbookPath, skillPath, SKILL_FILE))
  if (stillMissing) {
    return { success: false, error: `Skill not found in library checkout: ${skillName}` }
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

  // If library has an origin remote, clone from origin to track the actual remote
  // Otherwise, clone from the local library path
  const originUrl = await getRemoteUrl(libraryPath, 'origin')
  const cloneSource = originUrl ?? libraryPath

  const cloneResult = await runGit(projectPath, [
    'clone',
    '--filter=blob:none',
    '--sparse',
    '--no-checkout',
    cloneSource,
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
    const refreshResult = await refreshSparseCheckout(skillbookPath, skillName)
    if (!refreshResult.success) return refreshResult

    const skillFilePath = join(getSkillbookSkillsPath(projectPath), skillName, SKILL_FILE)
    if (!existsSync(skillFilePath)) {
      return { success: false, error: `Skill not found in library checkout: ${skillName}` }
    }

    return { success: true }
  }

  const writeResult = await writeSparsePatterns(skillbookPath, [...currentPatterns, skillPattern])
  if (!writeResult.success) return writeResult

  const refreshResult = await refreshSparseCheckout(skillbookPath, skillName)
  if (!refreshResult.success) return refreshResult

  const skillFilePath = join(getSkillbookSkillsPath(projectPath), skillName, SKILL_FILE)
  if (!existsSync(skillFilePath)) {
    return { success: false, error: `Skill not found in library checkout: ${skillName}` }
  }

  return { success: true }
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
  } catch (error) {
    if (!isIgnoredFsError(error)) {
      logError('Failed to read sparse checkout skills', error, { skillsPath })
    }
    return []
  }
}
