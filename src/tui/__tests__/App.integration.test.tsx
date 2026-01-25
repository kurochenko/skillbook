import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import { render } from 'ink-testing-library'
import { rmSync, existsSync } from 'fs'
import { join } from 'path'
import App from '@/tui/App'
import {
  setupFixtures,
  cleanupFixtures,
  LIBRARY_PATH,
  PROJECT_PATH,
} from '../../../test-fixtures/setup'
import {
  waitFor,
  stripAnsi,
  isSymlink,
  pathExists,
  readFile,
  navigateToRow,
} from '../../../test-fixtures/helpers'

let originalLibraryEnv: string | undefined

beforeAll(() => {
  originalLibraryEnv = process.env.SKILLBOOK_LIBRARY
  process.env.SKILLBOOK_LIBRARY = LIBRARY_PATH
})

beforeEach(() => {
  setupFixtures()
})

afterAll(() => {
  cleanupFixtures()

  if (originalLibraryEnv !== undefined) {
    process.env.SKILLBOOK_LIBRARY = originalLibraryEnv
  } else {
    delete process.env.SKILLBOOK_LIBRARY
  }
})

describe('App TUI Integration', () => {
  test('displays correct initial state with all skill statuses', async () => {
    const { lastFrame, unmount } = render(
      <App projectPath={PROJECT_PATH} inProject={true} />,
    )

    await waitFor(() => lastFrame()?.includes('INSTALLED') ?? false)

    const output = stripAnsi(lastFrame() ?? '')

    expect(output).toContain('INSTALLED')

    expect(output).toContain('skill-in-lib')

    expect(output).toContain('[detached] skill-detached')

    expect(output).toContain('[conflict')
    expect(output).toContain('skill-unanimous-conflict')

    expect(output).toContain('LOCAL')
    const localSection = output.split('LOCAL')[1]?.split('AVAILABLE')[0] ?? ''
    expect(localSection).toContain('skill-local')

    expect(output).toContain('AVAILABLE')
    const availableSection = output.split('AVAILABLE')[1] ?? ''
    expect(availableSection).toContain('skill-available')

    unmount()
  })

  test('sync detached skill converts real file to symlink', async () => {
    const skillDirPath = join(
      PROJECT_PATH,
      '.claude/skills/skill-detached',
    )

    expect(isSymlink(skillDirPath)).toBe(false)

    const { lastFrame, stdin, unmount } = render(
      <App projectPath={PROJECT_PATH} inProject={true} />,
    )

    await waitFor(() => lastFrame()?.includes('INSTALLED') ?? false)

    const frame = stripAnsi(lastFrame() ?? '')
    expect(frame).toContain('> [detached] skill-detached')

    stdin.write('s')

    await waitFor(() => {
      const frame = stripAnsi(lastFrame() ?? '')
      return frame.includes('[✓] skill-detached') && isSymlink(skillDirPath)
    }, 5000)

    expect(isSymlink(skillDirPath)).toBe(true)

    unmount()
  })

  test('push local skill adds it to library', async () => {
    const librarySkillPath = join(
      LIBRARY_PATH,
      'skills/skill-local/SKILL.md',
    )

    expect(pathExists(librarySkillPath)).toBe(false)

    const { lastFrame, stdin, unmount } = render(
      <App projectPath={PROJECT_PATH} inProject={true} />,
    )

    await waitFor(() => (lastFrame() ?? '').includes('LOCAL'))

    const found = await navigateToRow('skill-local', stdin, lastFrame)
    expect(found).toBe(true)

    expect(stripAnsi(lastFrame() ?? '')).toContain('> skill-local')

    stdin.write('p')

    await waitFor(() => {
      try {
        readFile(librarySkillPath)
        return true
      } catch {
        return false
      }
    }, 3000)

    const libraryContent = readFile(librarySkillPath)
    expect(libraryContent).toContain('Local Skill')

    unmount()
  })

  test('install available skill creates symlinks', async () => {
    const skillDirPath = join(
      PROJECT_PATH,
      '.claude/skills/skill-available',
    )

    expect(pathExists(skillDirPath)).toBe(false)

    const { lastFrame, stdin, unmount } = render(
      <App projectPath={PROJECT_PATH} inProject={true} />,
    )

    await waitFor(() => (lastFrame() ?? '').includes('AVAILABLE'))

    const found = await navigateToRow('skill-available', stdin, lastFrame)
    expect(found).toBe(true)

    expect(stripAnsi(lastFrame() ?? '')).toContain('> skill-available')

    stdin.write('i')

    await waitFor(() => pathExists(skillDirPath), 3000)

    expect(isSymlink(skillDirPath)).toBe(true)

    unmount()
  })

  test('uninstall skill removes symlink from enabled harness', async () => {
    const claudeSkillPath = join(
      PROJECT_PATH,
      '.claude/skills/skill-in-lib',
    )

    expect(isSymlink(claudeSkillPath)).toBe(true)

    const { lastFrame, stdin, unmount } = render(
      <App projectPath={PROJECT_PATH} inProject={true} />,
    )

    await waitFor(() => lastFrame()?.includes('INSTALLED') ?? false)

    const found = await navigateToRow('skill-in-lib', stdin, lastFrame)
    expect(found).toBe(true)

    expect(stripAnsi(lastFrame() ?? '')).toContain('> skill-in-lib')

    stdin.write('u')

    await waitFor(() => !isSymlink(claudeSkillPath), 3000)

    expect(isSymlink(claudeSkillPath)).toBe(false)
    expect(pathExists(claudeSkillPath)).toBe(false)

    const frame = stripAnsi(lastFrame() ?? '')
    expect(frame).toContain('skill-in-lib')

    unmount()
  })

  test('sync conflict overwrites local with library version', async () => {
    const skillPath = join(
      PROJECT_PATH,
      '.claude/skills/skill-unanimous-conflict/SKILL.md',
    )

    expect(readFile(skillPath)).toContain('LOCAL VERSION')

    const { lastFrame, stdin, unmount } = render(
      <App projectPath={PROJECT_PATH} inProject={true} />,
    )

    await waitFor(() => lastFrame()?.includes('INSTALLED') ?? false)

    const found = await navigateToRow('skill-unanimous-conflict', stdin, lastFrame)
    expect(found).toBe(true)

    expect(stripAnsi(lastFrame() ?? '')).toContain('> [conflict')
    expect(stripAnsi(lastFrame() ?? '')).toContain('skill-unanimous-conflict')

    stdin.write('s')

    await waitFor(() => {
      const frame = stripAnsi(lastFrame() ?? '')
      return frame.includes('Sync') && frame.includes('overwrite')
    }, 2000)

    stdin.write('y')

    await waitFor(() => {
      const frame = stripAnsi(lastFrame() ?? '')
      const hasNewStatus = frame.includes('[✓] skill-unanimous-conflict')
      const hasLibraryContent = readFile(skillPath).includes('LIBRARY VERSION')
      return hasNewStatus && hasLibraryContent
    }, 5000)

    expect(readFile(skillPath)).toContain('LIBRARY VERSION')

    unmount()
  })

  test('push conflict updates library with local version', async () => {
    const libraryPath = join(
      LIBRARY_PATH,
      'skills/skill-unanimous-conflict/SKILL.md',
    )

    expect(readFile(libraryPath)).toContain('LIBRARY VERSION')

    const { lastFrame, stdin, unmount } = render(
      <App projectPath={PROJECT_PATH} inProject={true} />,
    )

    await waitFor(() => lastFrame()?.includes('INSTALLED') ?? false)

    const found = await navigateToRow('skill-unanimous-conflict', stdin, lastFrame)
    expect(found).toBe(true)

    expect(stripAnsi(lastFrame() ?? '')).toContain('> [conflict')

    stdin.write('p')

    await waitFor(() => {
      const frame = stripAnsi(lastFrame() ?? '')
      return frame.includes('[✓] skill-unanimous-conflict') || 
             frame.includes('[detached] skill-unanimous-conflict')
    }, 5000)

    expect(readFile(libraryPath)).toContain('LOCAL VERSION')

    unmount()
  })
})

describe('App TUI Harness Tab Integration', () => {
  test('tab key switches to harnesses tab and displays harness states', async () => {
    const { lastFrame, stdin, unmount } = render(
      <App projectPath={PROJECT_PATH} inProject={true} />,
    )

    await waitFor(() => lastFrame()?.includes('INSTALLED') ?? false)

    expect(stripAnsi(lastFrame() ?? '')).toContain('INSTALLED')

    stdin.write('\t')

    await waitFor(() => {
      const frame = stripAnsi(lastFrame() ?? '')
      return frame.includes('SELECT HARNESSES')
    }, 2000)

    const frame = stripAnsi(lastFrame() ?? '')

    expect(frame).toContain('SELECT HARNESSES')

    expect(frame).toContain('Claude Code')

    expect(frame).toContain('OpenCode')

    expect(frame).toContain('Cursor')

    expect(frame).toContain('[tab] skills')

    unmount()
  })

  test('enable harness creates folder and symlinks for installed skills', async () => {
    const cursorDir = join(PROJECT_PATH, '.cursor', 'rules')
    const skillPath = join(cursorDir, 'skill-in-lib.md')

    expect(pathExists(cursorDir)).toBe(false)

    const { lastFrame, stdin, unmount } = render(
      <App projectPath={PROJECT_PATH} inProject={true} />,
    )

    await waitFor(() => lastFrame()?.includes('INSTALLED') ?? false)

    stdin.write('\t')

    await waitFor(() => {
      const frame = stripAnsi(lastFrame() ?? '')
      return frame.includes('SELECT HARNESSES')
    }, 2000)

    const found = await navigateToRow('Cursor', stdin, lastFrame)
    expect(found).toBe(true)

    const frame = stripAnsi(lastFrame() ?? '')
    expect(frame).toContain('> [ ] Cursor')

    stdin.write('e')

    await waitFor(() => pathExists(skillPath), 3000)

    expect(pathExists(skillPath)).toBe(true)

    await waitFor(() => {
      const frame = stripAnsi(lastFrame() ?? '')
      return frame.includes('[✓] Cursor')
    }, 2000)

    unmount()
  })

  test('remove harness deletes folder after confirmation', async () => {
    const opencodeDir = join(PROJECT_PATH, '.opencode', 'skill')

    expect(pathExists(opencodeDir)).toBe(true)

    const { lastFrame, stdin, unmount } = render(
      <App projectPath={PROJECT_PATH} inProject={true} />,
    )

    await waitFor(() => lastFrame()?.includes('INSTALLED') ?? false)

    stdin.write('\t')

    await waitFor(() => {
      const frame = stripAnsi(lastFrame() ?? '')
      return frame.includes('SELECT HARNESSES')
    }, 2000)

    const found = await navigateToRow('OpenCode', stdin, lastFrame)
    expect(found).toBe(true)

    stdin.write('r')

    await waitFor(() => {
      const frame = stripAnsi(lastFrame() ?? '')
      return frame.includes('Remove') && frame.includes('[y]es')
    }, 2000)

    stdin.write('y')

    await waitFor(() => !pathExists(opencodeDir), 3000)

    expect(pathExists(opencodeDir)).toBe(false)

    unmount()
  })

  test('detach harness converts symlinks to real files', async () => {
    const claudeSkillDir = join(PROJECT_PATH, '.claude', 'skills', 'skill-in-lib')
    const claudeSkillFile = join(claudeSkillDir, 'SKILL.md')

    expect(isSymlink(claudeSkillDir)).toBe(true)

    const { lastFrame, stdin, unmount } = render(
      <App projectPath={PROJECT_PATH} inProject={true} />,
    )

    await waitFor(() => lastFrame()?.includes('INSTALLED') ?? false)

    stdin.write('\t')

    await waitFor(() => {
      const frame = stripAnsi(lastFrame() ?? '')
      return frame.includes('SELECT HARNESSES')
    }, 2000)

    const found = await navigateToRow('Claude Code', stdin, lastFrame)
    expect(found).toBe(true)

    expect(stripAnsi(lastFrame() ?? '')).toContain('[~] Claude Code')

    stdin.write('d')

    await waitFor(() => {
      return pathExists(claudeSkillFile) && !isSymlink(claudeSkillDir)
    }, 3000)

    expect(isSymlink(claudeSkillDir)).toBe(false)
    expect(pathExists(claudeSkillFile)).toBe(true)

    const content = readFile(claudeSkillFile)
    expect(content).toContain('Skill In Library')

    await waitFor(() => {
      const frame = stripAnsi(lastFrame() ?? '')
      return frame.includes('[d] Claude Code')
    }, 2000)

    unmount()
  })
})

describe('App TUI Library Mode', () => {
  test('library mode shows only AVAILABLE skills (no INSTALLED or LOCAL)', async () => {
    const { lastFrame, unmount } = render(
      <App projectPath={LIBRARY_PATH} inProject={false} />,
    )

    await waitFor(() => {
      const frame = stripAnsi(lastFrame() ?? '')
      return frame.includes('AVAILABLE')
    }, 3000)

    const frame = stripAnsi(lastFrame() ?? '')

    expect(frame).toContain('AVAILABLE')
    expect(frame).toContain('skill-available')

    expect(frame).not.toContain('INSTALLED')
    expect(frame).not.toContain('LOCAL')

    expect(frame).toContain('Library Mode')

    unmount()
  })
})

describe('App TUI Lazy Init', () => {
  test('install creates .skillbook sparse checkout when missing', async () => {
    const skillbookPath = join(PROJECT_PATH, '.skillbook')
    const skillbookGitPath = join(skillbookPath, '.git')

    if (existsSync(skillbookPath)) {
      rmSync(skillbookPath, { recursive: true, force: true })
    }

    expect(existsSync(skillbookPath)).toBe(false)

    const { lastFrame, stdin, unmount } = render(
      <App projectPath={PROJECT_PATH} inProject={true} />,
    )

    await waitFor(() => {
      const frame = stripAnsi(lastFrame() ?? '')
      return frame.includes('AVAILABLE') || frame.includes('INSTALLED')
    }, 3000)

    const found = await navigateToRow('skill-available', stdin, lastFrame)
    expect(found).toBe(true)

    stdin.write('i')

    const skillDir = join(PROJECT_PATH, '.claude', 'skills', 'skill-available')

    await waitFor(() => {
      return existsSync(skillbookGitPath) && existsSync(skillDir)
    }, 5000)

    expect(existsSync(skillbookPath)).toBe(true)
    expect(existsSync(skillbookGitPath)).toBe(true)

    expect(existsSync(skillDir)).toBe(true)
    expect(isSymlink(skillDir)).toBe(true)

    unmount()
  })
})
