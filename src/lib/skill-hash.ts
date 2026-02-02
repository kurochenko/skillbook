import { readdirSync, readFileSync } from 'fs'
import { join, relative } from 'path'
import { createHash } from 'crypto'

export type SkillHashOptions = {
  ignore?: string[]
}

const normalizePath = (path: string): string => path.replace(/\\/g, '/')

const normalizeContent = (content: string): string => content.replace(/\r\n/g, '\n')

const collectFiles = (dir: string, acc: string[] = []): string[] => {
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      collectFiles(fullPath, acc)
    } else if (entry.isFile()) {
      acc.push(fullPath)
    }
  }
  return acc
}

export const computeSkillHash = async (
  skillDir: string,
  options: SkillHashOptions = {},
): Promise<string> => {
  const ignore = new Set((options.ignore ?? []).map(normalizePath))
  const hash = createHash('sha256')

  const files = collectFiles(skillDir)
    .map((file) => ({
      fullPath: file,
      relativePath: normalizePath(relative(skillDir, file)),
    }))
    .filter((file) => !ignore.has(file.relativePath))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath))

  for (const file of files) {
    const content = readFileSync(file.fullPath, 'utf-8')
    hash.update(`${file.relativePath}\n`)
    hash.update(normalizeContent(content))
  }

  return `sha256:${hash.digest('hex')}`
}
