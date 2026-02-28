import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, realpathSync, lstatSync } from 'fs'
import { join, resolve, basename, dirname } from 'path'
import { createHash } from 'crypto'
import { fdir } from 'fdir'
import { getLibraryPath, getSkillsPath, getSkillPath } from '@/lib/paths'
import { getLockFilePath, getLockLibraryPath } from '@/lib/lock-paths'
import { readLockFile, setLockEntry, writeLockFile } from '@/lib/lockfile'
import { computeSkillHash } from '@/lib/skill-hash'
import { copySkillDir } from '@/lib/lock-copy'
import { gitInit, gitAdd, gitCommit, ensureGitConfig, isGitRepo, gitPush } from '@/lib/git'
import { resolveOriginPlan } from '@/lib/library-sync'
import { SKILL_FILE, SKILLS_DIR } from '@/constants'
import { extractSkillName, validateSkillName } from '@/lib/skills'
import { DEFAULT_SKILLS } from '@/lib/default-skills'
import { isIgnoredFsError, logError } from '@/lib/logger'

export type LibraryInitResult =
  | { success: true; path: string; created: boolean }
  | { success: false; error: string }

export type AddSkillResult =
  | { success: true; action: 'added' | 'updated' | 'skipped'; commitHash?: string; path: string; warning?: string }
  | { success: false; error: string }

export type ScanSkillStatus = 'detached' | 'synced' | 'ahead'

export type DiffStats = {
  additions: number
  deletions: number
}

export type ScannedSkill = {
  name: string
  path: string
  dirPath: string | null
  content: string
  status: ScanSkillStatus
  diff: DiffStats | null
  hasConflict: boolean
  conflictCount: number
  project: string
  projectPath: string
}

type PartialSkill = {
  name: string
  path: string
  dirPath: string | null
  content: string
  variantFingerprint: string
  status: ScanSkillStatus
  diff: DiffStats | null
  project: string
  projectPath: string
}

export type ScanOptions = {
  onSkillFound?: (skill: PartialSkill) => void
}

const LIBRARY_GITIGNORE_ENTRIES = [
  '*.local',
  '.DS_Store',
  'out-of-date.json',
  'update-check.json',
  'locks/',
]

const IGNORED_DIRS_SET = new Set([
  'node_modules',
  'vendor',
  '__pycache__',
  '.venv',
  'venv',
  '.cache',
  '.turbo',
  'target',
  'Pods',
])

const SKILL_PATH_MARKERS = [
  { marker: '/.claude/skills/', suffix: `/${SKILL_FILE}`, needsDirectory: true },
  { marker: '/.codex/skills/', suffix: `/${SKILL_FILE}`, needsDirectory: true },
  { marker: '/.cursor/rules/', suffix: '.md', needsDirectory: false },
  { marker: '/.opencode/skill/', suffix: `/${SKILL_FILE}`, needsDirectory: true },
  { marker: '/.skillbook/skills/', suffix: `/${SKILL_FILE}`, needsDirectory: true },
  { marker: '/.pi/skills/', suffix: `/${SKILL_FILE}`, needsDirectory: true },
]

const readFileSafe = (path: string): string | null => {
  try {
    return readFileSync(path, 'utf-8')
  } catch (error) {
    if (!isIgnoredFsError(error)) {
      logError('Failed to read file', error, { path })
    }
    return null
  }
}

const readDirSafe = (path: string) => {
  try {
    return readdirSync(path, { withFileTypes: true })
  } catch (error) {
    if (!isIgnoredFsError(error)) {
      logError('Failed to read directory', error, { path })
    }
    return []
  }
}

const readFileText = async (path: string): Promise<string | null> => {
  try {
    return await Bun.file(path).text()
  } catch (error) {
    if (!isIgnoredFsError(error)) {
      logError('Failed to read file', error, { path })
    }
    return null
  }
}

const normalizePath = (path: string): string => path.replace(/\\/g, '/')

const isSkillFile = (path: string): boolean => {
  const normalized = normalizePath(path)
  return SKILL_PATH_MARKERS.some(({ marker, suffix }) =>
    normalized.includes(marker) && normalized.endsWith(suffix)
  )
}

const isDirectoryBasedSkill = (path: string): boolean => {
  const normalized = normalizePath(path)
  const match = SKILL_PATH_MARKERS.find(({ marker, suffix }) =>
    normalized.includes(marker) && normalized.endsWith(suffix)
  )
  return match?.needsDirectory ?? false
}

const getSkillDirPath = (filePath: string): string | null => {
  if (!isDirectoryBasedSkill(filePath)) return null
  return dirname(filePath)
}

const extractProjectPath = (filePath: string): string => {
  const normalized = normalizePath(filePath)
  const match = SKILL_PATH_MARKERS.find(({ marker }) => normalized.includes(marker))
  if (!match) return dirname(dirname(dirname(filePath)))

  const idx = normalized.indexOf(match.marker)
  return filePath.slice(0, idx)
}

const extractProjectFromPath = (filePath: string): string => {
  const projectPath = extractProjectPath(filePath)
  if (!projectPath) return 'unknown'
  return basename(projectPath) || 'unknown'
}

const countLines = (text: string): Map<string, number> => {
  const map = new Map<string, number>()
  for (const line of text.split('\n')) {
    map.set(line, (map.get(line) ?? 0) + 1)
  }
  return map
}

const computeSingleFileSkillHash = (content: string): string => {
  const hash = createHash('sha256')
  hash.update(`${SKILL_FILE}\n`)
  hash.update(content.replace(/\r\n/g, '\n'))
  return `sha256:${hash.digest('hex')}`
}

export const calculateDiff = (base: string, current: string): DiffStats => {
  const baseCounts = countLines(base)
  const currentCounts = countLines(current)
  const lines = new Set([...baseCounts.keys(), ...currentCounts.keys()])

  let additions = 0
  let deletions = 0

  for (const line of lines) {
    const baseCount = baseCounts.get(line) ?? 0
    const currentCount = currentCounts.get(line) ?? 0
    if (currentCount > baseCount) additions += currentCount - baseCount
    if (baseCount > currentCount) deletions += baseCount - currentCount
  }

  return { additions, deletions }
}

const isSymlinkPath = (path: string): boolean => {
  try {
    return lstatSync(path).isSymbolicLink() || lstatSync(dirname(path)).isSymbolicLink()
  } catch {
    return false
  }
}

const resolveRealPath = (path: string): string | null => {
  try {
    return realpathSync(path)
  } catch {
    return null
  }
}

const deduplicateSkillFiles = (paths: string[]): string[] => {
  const seen = new Map<string, string>()

  for (const path of paths) {
    const realPath = resolveRealPath(path) ?? path
    const existing = seen.get(realPath)

    if (!existing || (!isSymlinkPath(path) && isSymlinkPath(existing))) {
      seen.set(realPath, path)
    }
  }

  return [...seen.values()]
}

const getSkillFiles = async (basePath: string): Promise<string[]> => {
  const allPaths = await new fdir()
    .withFullPaths()
    .withSymlinks()
    .exclude((dirName) => IGNORED_DIRS_SET.has(dirName))
    .filter((path) => isSkillFile(path))
    .crawl(basePath)
    .withPromise()

  return deduplicateSkillFiles(allPaths)
}

const getScanStatus = (content: string, libraryContent: string | null) => {
  if (libraryContent === null) {
    return { status: 'detached' as const, diff: null }
  }

  if (libraryContent === content) {
    return { status: 'synced' as const, diff: null }
  }

  return { status: 'ahead' as const, diff: calculateDiff(libraryContent, content) }
}

const getScanStatusForDir = async (
  dirPath: string,
  skillName: string,
): Promise<{ status: ScanSkillStatus; diff: DiffStats | null; projectHash: string }> => {
  const projectHash = await computeSkillHash(dirPath)
  const librarySkillDir = getSkillPath(skillName)
  if (!existsSync(librarySkillDir) || !existsSync(join(librarySkillDir, SKILL_FILE))) {
    return { status: 'detached', diff: null, projectHash }
  }

  const libraryHash = await computeSkillHash(librarySkillDir)

  if (projectHash === libraryHash) {
    return { status: 'synced', diff: null, projectHash }
  }

  const libraryContent = readFileSafe(join(librarySkillDir, SKILL_FILE))
  const projectContent = readFileSafe(join(dirPath, SKILL_FILE))
  const diff = libraryContent !== null && projectContent !== null
    ? calculateDiff(libraryContent, projectContent)
    : null

  return { status: 'ahead', diff, projectHash }
}

const getConflictInfo = (
  skill: PartialSkill,
  skillsByName: Map<string, PartialSkill[]>,
): { hasConflict: boolean; conflictCount: number } => {
  if (skill.status === 'synced') {
    return { hasConflict: false, conflictCount: 0 }
  }

  const allInstances = skillsByName.get(skill.name) ?? []
  const sameStatusInstances = allInstances.filter((s) => s.status === skill.status)

  if (sameStatusInstances.length <= 1) {
    return { hasConflict: false, conflictCount: 0 }
  }

  const uniqueVariants = new Set(sameStatusInstances.map((s) => s.variantFingerprint))
  const conflictCount = uniqueVariants.size

  return {
    hasConflict: conflictCount > 1,
    conflictCount: conflictCount > 1 ? conflictCount : 0,
  }
}

export const ensureDefaultSkills = async (): Promise<void> => {
  const libraryPath = getLibraryPath()
  if (!existsSync(libraryPath)) return

  for (const { name, content } of DEFAULT_SKILLS) {
    const skillDir = getSkillPath(name)
    const skillFilePath = join(skillDir, SKILL_FILE)
    const existingContent = readFileSafe(skillFilePath)

    if (existingContent !== content) {
      if (!existsSync(skillDir)) {
        mkdirSync(skillDir, { recursive: true })
      }

      writeFileSync(skillFilePath, content, 'utf-8')

      const relativeSkillDir = `${SKILLS_DIR}/${name}/`
      await gitAdd(libraryPath, relativeSkillDir)

      const action = existingContent === null ? 'Add' : 'Update'
      await gitCommit(libraryPath, `${action} default skill: ${name}`)
    }
  }
}

export const ensureLibrary = async (): Promise<LibraryInitResult> => {
  const libraryPath = getLibraryPath()
  const skillsPath = getSkillsPath()
  const created = !existsSync(libraryPath)

  try {
    if (!existsSync(libraryPath)) {
      mkdirSync(libraryPath, { recursive: true })
    }

    if (!existsSync(skillsPath)) {
      mkdirSync(skillsPath, { recursive: true })
    }

    if (!isGitRepo(libraryPath)) {
      const initResult = await gitInit(libraryPath)
      if (!initResult.success) {
        return { success: false, error: `Failed to init git: ${initResult.error}` }
      }

      const configResult = await ensureGitConfig(libraryPath)
      if (!configResult.success) {
        return { success: false, error: `Failed to configure git: ${configResult.error}` }
      }

      const gitignorePath = join(libraryPath, '.gitignore')
      if (!existsSync(gitignorePath)) {
        writeFileSync(gitignorePath, `${LIBRARY_GITIGNORE_ENTRIES.join('\n')}\n`)
      }

      await gitAdd(libraryPath, '.')
      await gitCommit(libraryPath, 'Initialize skillbook library')
    }

    await ensureDefaultSkills()

    return { success: true, path: libraryPath, created }
  } catch (error) {
    logError('Failed to ensure library', error, { libraryPath })
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export const skillExists = (skillName: string): boolean => {
  const skillPath = join(getSkillPath(skillName), SKILL_FILE)
  return existsSync(skillPath)
}

export const getSkillContent = (skillName: string): string | null => {
  const skillPath = join(getSkillPath(skillName), SKILL_FILE)
  return readFileSafe(skillPath)
}

export const listSkills = (): string[] => {
  const skillsPath = getSkillsPath()
  if (!existsSync(skillsPath)) return []

  return readDirSafe(skillsPath)
    .filter((entry) => entry.isDirectory())
    .filter((entry) => existsSync(join(skillsPath, entry.name, SKILL_FILE)))
    .map((entry) => entry.name)
    .sort()
}

type SkipCheckResult =
  | { skip: true; result: AddSkillResult }
  | { skip: false }

type CommitSkillOptions = {
  skillName: string
  checkSkip: (params: {
    skillDir: string
    lock: ReturnType<typeof readLockFile>
    existingEntry: ReturnType<typeof readLockFile>['skills'][string] | undefined
    lockFilePath: string
  }) => Promise<SkipCheckResult>
  writeContent: (skillDir: string) => void
  gitAddPath: string
  resultPath: string
  errorContext: Record<string, string>
}

const commitSkillToLibrary = async (options: CommitSkillOptions): Promise<AddSkillResult> => {
  const { skillName, checkSkip, writeContent, gitAddPath, resultPath, errorContext } = options
  const libraryPath = getLibraryPath()
  const lockLibraryPath = getLockLibraryPath()
  const skillDir = getSkillPath(skillName)

  const libraryResult = await ensureLibrary()
  if (!libraryResult.success) {
    return { success: false, error: libraryResult.error }
  }

  const existingContent = getSkillContent(skillName)
  const isUpdate = existingContent !== null

  const lockFilePath = getLockFilePath(lockLibraryPath)
  const lock = readLockFile(lockFilePath)
  const existingEntry = lock.skills[skillName]

  const skipResult = await checkSkip({ skillDir, lock, existingEntry, lockFilePath })
  if (skipResult.skip) return skipResult.result

  try {
    const originPlan = await resolveOriginPlan(libraryPath, skillName)
    if (originPlan.status === 'error') {
      return { success: false, error: originPlan.error }
    }

    writeContent(skillDir)

    const hash = await computeSkillHash(skillDir)
    const nextVersion = existingEntry ? existingEntry.version + 1 : 1
    const updatedLock = setLockEntry(lock, skillName, { version: nextVersion, hash })
    writeLockFile(lockFilePath, updatedLock)

    const addResult = await gitAdd(libraryPath, gitAddPath)
    if (!addResult.success) {
      return { success: false, error: `Failed to stage files: ${addResult.error}` }
    }

    const action: 'added' | 'updated' = isUpdate ? 'updated' : 'added'
    const commitMessage = isUpdate ? `Update skill: ${skillName}` : `Add skill: ${skillName}`
    const commitResult = await gitCommit(libraryPath, commitMessage)

    const buildSuccess = (commitHash?: string, warning?: string): AddSkillResult => ({
      success: true,
      action,
      commitHash,
      path: resultPath,
      warning,
    })

    if (!commitResult.success) {
      return buildSuccess(undefined, `Skill saved but git commit failed: ${commitResult.error}`)
    }

    if (originPlan.status === 'skip') {
      return buildSuccess(commitResult.commitHash, originPlan.warning)
    }

    const pushResult = await gitPush(libraryPath)
    if (!pushResult.success) {
      return buildSuccess(commitResult.commitHash, `Skill committed but failed to push to origin: ${pushResult.error}`)
    }

    return buildSuccess(commitResult.commitHash)
  } catch (error) {
    logError('Failed to add skill to library', error, errorContext)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export const addSkillToLibrary = async (
  skillName: string,
  content: string,
): Promise<AddSkillResult> => {
  const skillDir = getSkillPath(skillName)
  const skillFilePath = join(skillDir, SKILL_FILE)

  return commitSkillToLibrary({
    skillName,
    checkSkip: async ({ skillDir: dir, lock, existingEntry, lockFilePath }) => {
      const existingContent = getSkillContent(skillName)
      if (existingContent !== null && existingContent === content) {
        if (!existingEntry) {
          const hash = await computeSkillHash(dir)
          const updated = setLockEntry(lock, skillName, { version: 1, hash })
          writeLockFile(lockFilePath, updated)
        }
        return { skip: true, result: { success: true, action: 'skipped', path: skillFilePath } }
      }
      return { skip: false }
    },
    writeContent: (dir) => {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
      writeFileSync(join(dir, SKILL_FILE), content, 'utf-8')
    },
    gitAddPath: `${SKILLS_DIR}/${skillName}/${SKILL_FILE}`,
    resultPath: skillFilePath,
    errorContext: { skillName },
  })
}

export const addSkillDirToLibrary = async (
  skillName: string,
  sourceDir: string,
): Promise<AddSkillResult> => {
  const skillDir = getSkillPath(skillName)

  return commitSkillToLibrary({
    skillName,
    checkSkip: async ({ existingEntry }) => {
      const sourceHash = await computeSkillHash(sourceDir)
      const existingHash = existingEntry?.hash
      if (existingHash === sourceHash) {
        return { skip: true, result: { success: true, action: 'skipped', path: skillDir } }
      }
      return { skip: false }
    },
    writeContent: (dir) => {
      copySkillDir(sourceDir, dir)
    },
    gitAddPath: `${SKILLS_DIR}/${skillName}/`,
    resultPath: skillDir,
    errorContext: { skillName, sourceDir },
  })
}

export const scanProjectSkills = async (
  basePath: string = '.',
  options: ScanOptions = {},
): Promise<ScannedSkill[]> => {
  const { onSkillFound } = options
  const absolutePath = resolve(basePath)
  const skillFiles = await getSkillFiles(absolutePath)
  const skills: PartialSkill[] = []
  const skillsByName = new Map<string, PartialSkill[]>()
  const libraryContentCache = new Map<string, string | null>()

  const getLibraryContent = (name: string) => {
    if (!libraryContentCache.has(name)) {
      libraryContentCache.set(name, getSkillContent(name))
    }
    return libraryContentCache.get(name) ?? null
  }

  for (const file of skillFiles) {
    const name = extractSkillName(file)
    if (!name) continue

    const validation = validateSkillName(name)
    if (!validation.valid) continue

    const content = await readFileText(file)
    if (content === null) continue

    const dirPath = getSkillDirPath(file)
    const projectPath = extractProjectPath(file)
    const project = projectPath ? basename(projectPath) : extractProjectFromPath(file)

    const directoryStatus = dirPath ? await getScanStatusForDir(dirPath, name) : null
    const { status, diff } = directoryStatus ?? getScanStatus(content, getLibraryContent(name))
    const variantFingerprint = directoryStatus
      ? directoryStatus.projectHash
      : computeSingleFileSkillHash(content)

    const skill: PartialSkill = {
      name,
      path: file,
      dirPath,
      content,
      variantFingerprint,
      status,
      diff,
      project,
      projectPath,
    }
    skills.push(skill)

    const existing = skillsByName.get(name) ?? []
    existing.push(skill)
    skillsByName.set(name, existing)

    onSkillFound?.(skill)
  }

  return skills
    .map((skill) => {
      const { hasConflict, conflictCount } = getConflictInfo(skill, skillsByName)
      const { variantFingerprint: _, ...rest } = skill
      return { ...rest, hasConflict, conflictCount }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}
