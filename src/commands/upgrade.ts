import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { chmodSync, createWriteStream, renameSync, unlinkSync } from 'fs'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import {
  checkForUpdate,
  getDownloadUrl,
  getInstallPath,
  getPlatformBinary,
} from '@/lib/version'
import { ensureDefaultSkills } from '@/lib/library'

type UpgradeInfo = {
  updateAvailable: boolean
  currentVersion: string
  latestVersion: string | null
}

const safeUnlink = (path: string): void => {
  try {
    unlinkSync(path)
  } catch {
    return
  }
}

const safeRename = (from: string, to: string): void => {
  try {
    renameSync(from, to)
  } catch {
    return
  }
}

const formatError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const fetchUpgradeInfo = async (
  spinner: ReturnType<typeof p.spinner>,
): Promise<UpgradeInfo> => {
  spinner.start('Checking for updates...')

  const { updateAvailable, currentVersion, latestVersion } = await checkForUpdate(true)

  if (!latestVersion) {
    spinner.stop('Could not check for updates')
    return {
      updateAvailable: false,
      currentVersion,
      latestVersion: null,
    }
  }

  spinner.stop(`Current: ${pc.yellow(currentVersion)} | Latest: ${pc.green(latestVersion)}`)

  return {
    updateAvailable,
    currentVersion,
    latestVersion,
  }
}

const confirmUpgrade = async (
  currentVersion: string,
  latestVersion: string | null,
): Promise<boolean> => {
  const message = latestVersion
    ? `Upgrade from ${pc.yellow(currentVersion)} to ${pc.green(latestVersion)}?`
    : 'Install the latest release?'

  const shouldUpgrade = await p.confirm({
    message,
    initialValue: true,
  })

  if (p.isCancel(shouldUpgrade) || !shouldUpgrade) {
    p.outro('Upgrade cancelled.')
    return false
  }

  return true
}

const downloadBinary = async (downloadUrl: string, tempPath: string): Promise<void> => {
  const response = await fetch(downloadUrl)

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`)
  }

  if (!response.body) {
    throw new Error('No response body')
  }

  const fileStream = createWriteStream(tempPath)
  await pipeline(
    Readable.fromWeb(response.body as import('stream/web').ReadableStream),
    fileStream,
  )
}

const installBinary = (installPath: string, tempPath: string): void => {
  const backupPath = `${installPath}.old`
  safeRename(installPath, backupPath)
  renameSync(tempPath, installPath)
  safeUnlink(backupPath)
}

export default defineCommand({
  meta: {
    name: 'upgrade',
    description: 'Upgrade skillbook to the latest version',
  },
  args: {
    force: {
      type: 'boolean',
      alias: 'f',
      description: 'Force upgrade even if already on latest version',
      default: false,
    },
  },
  async run({ args }) {
    p.intro(pc.cyan('skillbook upgrade'))

    const spinner = p.spinner()
    const info = await fetchUpgradeInfo(spinner)

    const { updateAvailable, currentVersion, latestVersion } = info

    if (!latestVersion && !args.force) {
      p.log.warn('Could not determine latest version. Installing latest release.')
    }

    if (latestVersion && !updateAvailable && !args.force) {
      p.log.success('You are already on the latest version!')
      p.outro('Nothing to do.')
      return
    }

    if (!updateAvailable && args.force) {
      p.log.warn('Forcing reinstall of current version...')
    }

    const shouldUpgrade = await confirmUpgrade(currentVersion, latestVersion)
    if (!shouldUpgrade) return

    const downloadUrl = getDownloadUrl(latestVersion ?? 'latest')
    const installPath = getInstallPath()
    const tempPath = `${installPath}.new`

    spinner.start(`Downloading ${getPlatformBinary()}...`)

    try {
      await downloadBinary(downloadUrl, tempPath)
      spinner.stop('Download complete')

      chmodSync(tempPath, 0o755)
      spinner.start('Installing...')

      installBinary(installPath, tempPath)
      spinner.stop('Installed successfully')

      await ensureDefaultSkills()

      if (latestVersion) {
        p.log.success(`Upgraded to ${pc.green(`v${latestVersion}`)}`)
      } else {
        p.log.success('Upgraded to the latest release')
      }
      p.outro('Run `skillbook --version` to verify.')
    } catch (error) {
      spinner.stop('Upgrade failed')
      safeUnlink(tempPath)

      p.log.error(`Failed to upgrade: ${formatError(error)}`)
      p.log.info('You can try manually downloading from:')
      p.log.info(pc.dim(downloadUrl))
      process.exit(1)
    }
  },
})
