import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'fs'
import { join } from 'path'

const ensureDir = (path: string) => {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true })
  }
}

const copyDirRecursive = (source: string, destination: string) => {
  ensureDir(destination)
  const entries = readdirSync(source, { withFileTypes: true })

  for (const entry of entries) {
    const sourcePath = join(source, entry.name)
    const destinationPath = join(destination, entry.name)

    if (entry.isDirectory()) {
      copyDirRecursive(sourcePath, destinationPath)
      continue
    }

    if (entry.isFile()) {
      copyFileSync(sourcePath, destinationPath)
    }
  }
}

export const copySkillDir = (source: string, destination: string) => {
  if (existsSync(destination)) {
    rmSync(destination, { recursive: true, force: true })
  }

  copyDirRecursive(source, destination)
}
