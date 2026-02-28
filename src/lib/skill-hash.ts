import { readFileSync } from 'fs'
import { createHash } from 'crypto'

import { collectFiles } from '@/lib/skill-fs'

export type SkillHashOptions = {
  ignore?: string[]
}

const normalizePath = (path: string): string => path.replace(/\\/g, '/')

const normalizeContent = (content: string): string => content.replace(/\r\n/g, '\n')

export const computeSkillHash = async (
  skillDir: string,
  options: SkillHashOptions = {},
): Promise<string> => {
  const ignore = new Set((options.ignore ?? []).map(normalizePath))
  const hash = createHash('sha256')

  const files = collectFiles(skillDir)
    .filter((file) => !ignore.has(file.relativePath))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath))

  for (const file of files) {
    const content = readFileSync(file.fullPath, 'utf-8')
    hash.update(`${file.relativePath}\n`)
    hash.update(normalizeContent(content))
  }

  return `sha256:${hash.digest('hex')}`
}
