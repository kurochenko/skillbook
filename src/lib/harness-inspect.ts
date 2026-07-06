import {
  type Dirent,
  lstatSync,
  readFileSync,
  readdirSync,
  readlinkSync,
} from 'fs'
import { createHash } from 'crypto'
import { dirname, isAbsolute, join, relative, resolve } from 'path'

export type HarnessPathType = 'missing' | 'symlink' | 'file' | 'directory' | 'other'

export type HarnessContentStatus =
  | 'harness-synced'
  | 'harness-drifted'
  | 'missing'
  | 'conflict'
  | 'stale'
  | 'untracked'

export const getPathType = (path: string): HarnessPathType => {
  try {
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) return 'symlink'
    if (stat.isDirectory()) return 'directory'
    if (stat.isFile()) return 'file'
    return 'other'
  } catch {
    return 'missing'
  }
}

export const readSymlinkTarget = (path: string): string | null => {
  try {
    return readlinkSync(path)
  } catch {
    return null
  }
}

export const isPathInside = (parentPath: string, candidatePath: string): boolean => {
  const parent = resolve(parentPath)
  const candidate = resolve(candidatePath)
  const pathFromParent = relative(parent, candidate)
  return pathFromParent === '' || (!pathFromParent.startsWith('..') && !isAbsolute(pathFromParent))
}

const readDirEntries = (path: string): Dirent[] => {
  try {
    return readdirSync(path, { withFileTypes: true })
  } catch {
    return []
  }
}

export const collectRegularFiles = (dir: string, baseDir = dir, acc: string[] = []): string[] | null => {
  const entries = readDirEntries(dir)

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    const relativePath = relative(baseDir, fullPath).replace(/\\/g, '/')

    if (entry.isDirectory()) {
      const nested = collectRegularFiles(fullPath, baseDir, acc)
      if (!nested) return null
      continue
    }

    if (!entry.isFile()) {
      return null
    }

    acc.push(relativePath)
  }

  return acc
}

export const computeDirectoryFingerprint = (dir: string): string | null => {
  const pathType = getPathType(dir)
  if (pathType !== 'directory') return null

  const files = collectRegularFiles(dir)
  if (!files) return null

  const hash = createHash('sha256')
  for (const relativePath of files.sort((a, b) => a.localeCompare(b))) {
    const fullPath = join(dir, relativePath)
    const content = readFileSync(fullPath)
    hash.update(`${relativePath}\n`)
    hash.update(content)
  }

  return `sha256:${hash.digest('hex')}`
}

export const filesEqual = (sourceFile: string, targetFile: string): boolean => {
  if (getPathType(sourceFile) !== 'file') return false
  if (getPathType(targetFile) !== 'file') return false

  const source = readFileSync(sourceFile)
  const target = readFileSync(targetFile)
  return source.equals(target)
}

export const directoriesEqual = (sourceDir: string, targetDir: string): boolean => {
  const sourceFingerprint = computeDirectoryFingerprint(sourceDir)
  const targetFingerprint = computeDirectoryFingerprint(targetDir)

  if (!sourceFingerprint || !targetFingerprint) return false
  return sourceFingerprint === targetFingerprint
}

export const inspectSymlinkTarget = (entryPath: string, targetPath: string): HarnessContentStatus => {
  const pathType = getPathType(entryPath)
  if (pathType === 'missing') return 'missing'

  if (pathType !== 'symlink') {
    return 'harness-drifted'
  }

  const relativeTarget = relative(dirname(entryPath), targetPath)
  return readSymlinkTarget(entryPath) === relativeTarget ? 'harness-synced' : 'harness-drifted'
}

export const inspectCopyTarget = (
  entryPath: string,
  targetPath: string,
  needsDirectory: boolean,
): HarnessContentStatus => {
  const pathType = getPathType(entryPath)
  if (pathType === 'missing') return 'missing'

  if (pathType === 'symlink') {
    return 'harness-drifted'
  }

  if (needsDirectory) {
    if (pathType !== 'directory') return 'conflict'
    return directoriesEqual(targetPath, entryPath) ? 'harness-synced' : 'harness-drifted'
  }

  if (pathType !== 'file') return 'conflict'
  return filesEqual(targetPath, entryPath) ? 'harness-synced' : 'harness-drifted'
}

export const symlinkTargetPointsIntoProjectSkills = (
  entryPath: string,
  projectSkillsPath: string,
): boolean => {
  const rawTarget = readSymlinkTarget(entryPath)
  if (!rawTarget) return false

  const resolvedTarget = resolve(dirname(entryPath), rawTarget)
  return isPathInside(projectSkillsPath, resolvedTarget)
}

export const inspectOrphanHarnessEntry = (
  entryPath: string,
  projectSkillsPath: string,
): HarnessContentStatus => {
  if (getPathType(entryPath) === 'symlink' && symlinkTargetPointsIntoProjectSkills(entryPath, projectSkillsPath)) {
    return 'stale'
  }

  return 'untracked'
}
