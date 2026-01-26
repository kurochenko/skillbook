import { spawnSync } from 'child_process'
import { writeFileSync } from 'fs'
import { join } from 'path'

export const runGit = (cwd: string, ...args: string[]) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8' })
  if (result.status !== 0) {
    throw new Error(`Git failed: git ${args.join(' ')}\n${result.stderr}`)
  }
  return result
}

export const initGitRepo = (
  path: string,
  name: string = 'Test User',
  email: string = 'test@test.com',
) => {
  runGit(path, 'init')
  runGit(path, 'config', 'user.email', email)
  runGit(path, 'config', 'user.name', name)
  writeFileSync(join(path, '.gitkeep'), '')
  runGit(path, 'add', '.')
  runGit(path, 'commit', '-m', 'Initial commit')
}
