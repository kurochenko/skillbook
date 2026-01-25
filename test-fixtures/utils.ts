import { mkdirSync, writeFileSync } from 'fs'
import { dirname } from 'path'

export const createFile = (path: string, content: string) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}
