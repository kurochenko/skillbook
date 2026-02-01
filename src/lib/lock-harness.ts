import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join, dirname, extname, basename } from 'path'
import { SKILL_FILE, TOOLS, type ToolId } from '@/constants'
import { copySkillDir } from '@/lib/lock-copy'
import { getLockSkillsPath, getProjectLockRoot } from '@/lib/lock-paths'
import { getHarnessBaseDir } from '@/lib/harness'

const ensureDir = (path: string) => {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true })
  }
}

const listProjectSkills = (projectSkillsPath: string): string[] => {
  if (!existsSync(projectSkillsPath)) return []

  return readdirSync(projectSkillsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => existsSync(join(projectSkillsPath, entry.name, SKILL_FILE)))
    .map((entry) => entry.name)
    .sort()
}

const listHarnessSkills = (projectPath: string, harnessId: ToolId): string[] => {
  const baseDir = getHarnessBaseDir(projectPath, harnessId)
  if (!existsSync(baseDir)) return []

  if (TOOLS[harnessId].needsDirectory) {
    return readdirSync(baseDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => existsSync(join(baseDir, entry.name, SKILL_FILE)))
      .map((entry) => entry.name)
      .sort()
  }

  return readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .filter((entry) => extname(entry.name) === '.md')
    .map((entry) => basename(entry.name, '.md'))
    .sort()
}

export const syncHarnessSkills = (projectPath: string, harnessId: ToolId): number => {
  const tool = TOOLS[harnessId]
  const projectSkillsPath = getLockSkillsPath(getProjectLockRoot(projectPath))
  const skillIds = listProjectSkills(projectSkillsPath)

  if (skillIds.length === 0) return 0

  ensureDir(getHarnessBaseDir(projectPath, harnessId))

  for (const skillId of skillIds) {
    const sourceDir = join(projectSkillsPath, skillId)
    const targetPath = join(projectPath, tool.skillPath(skillId))

    if (tool.needsDirectory) {
      copySkillDir(sourceDir, dirname(targetPath))
      continue
    }

    const sourceFile = join(sourceDir, SKILL_FILE)
    if (!existsSync(sourceFile)) continue

    ensureDir(dirname(targetPath))
    const content = readFileSync(sourceFile, 'utf-8')
    writeFileSync(targetPath, content, 'utf-8')
  }

  return skillIds.length
}

export const importHarnessSkills = (projectPath: string, harnessId: ToolId): number => {
  const tool = TOOLS[harnessId]
  const baseDir = getHarnessBaseDir(projectPath, harnessId)
  if (!existsSync(baseDir)) return 0

  const projectSkillsPath = getLockSkillsPath(getProjectLockRoot(projectPath))
  ensureDir(projectSkillsPath)

  const skillIds = listHarnessSkills(projectPath, harnessId)
  if (skillIds.length === 0) return 0

  for (const skillId of skillIds) {
    if (tool.needsDirectory) {
      const sourceDir = join(baseDir, skillId)
      const targetDir = join(projectSkillsPath, skillId)
      copySkillDir(sourceDir, targetDir)
      continue
    }

    const sourceFile = join(baseDir, `${skillId}.md`)
    if (!existsSync(sourceFile)) continue

    const content = readFileSync(sourceFile, 'utf-8')
    const targetDir = join(projectSkillsPath, skillId)
    ensureDir(targetDir)
    writeFileSync(join(targetDir, SKILL_FILE), content, 'utf-8')
  }

  return skillIds.length
}
