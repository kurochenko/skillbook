/**
 * Version tracking and update checking for skillbook.
 *
 * Version is injected at build time via `bun build --define`.
 * The check is throttled to once per 24 hours to avoid API rate limits.
 */

import { homedir } from 'os'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { clean, gt } from 'semver'
import { getLibraryPath } from '@/lib/paths'

// Injected at build time via --define BUILD_VERSION='"x.y.z"'
// Falls back to 'dev' for local development
declare const BUILD_VERSION: string
export const VERSION = typeof BUILD_VERSION !== 'undefined' ? BUILD_VERSION : 'dev'

const GITHUB_REPO = 'kurochenko/skillbook'
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24 hours
const CACHE_DIR = getLibraryPath()
const CACHE_FILE = join(CACHE_DIR, 'update-check.json')

type UpdateCache = {
  lastCheck: number
  latestVersion: string | null
}

const readCache = (): UpdateCache | null => {
  try {
    if (!existsSync(CACHE_FILE)) return null
    const data = readFileSync(CACHE_FILE, 'utf-8')
    return JSON.parse(data)
  } catch {
    return null
  }
}

const writeCache = (cache: UpdateCache): void => {
  try {
    if (!existsSync(CACHE_DIR)) {
      mkdirSync(CACHE_DIR, { recursive: true })
    }
    writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2))
  } catch {
    // Ignore cache write errors
  }
}

const fetchLatestTagFromApi = async (): Promise<string | null> => {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'skillbook-cli',
        },
      },
    )

    if (!response.ok) return null

    const data = (await response.json()) as { tag_name?: string }
    const tag = data.tag_name
    if (!tag) return null

    return tag
  } catch {
    return null
  }
}

const extractTagFromUrl = (url: string): string | null => {
  const match = url.match(/\/releases\/tag\/([^/]+)$/)
  return match ? match[1] ?? null : null
}

const fetchLatestTagFromRedirect = async (): Promise<string | null> => {
  try {
    const response = await fetch(`https://github.com/${GITHUB_REPO}/releases/latest`, {
      method: 'HEAD',
      redirect: 'manual',
    })

    const location = response.headers.get('location')
    if (location) return extractTagFromUrl(location)

    if (response.url) return extractTagFromUrl(response.url)
    return null
  } catch {
    return null
  }
}

const fetchLatestTag = async (): Promise<string | null> => {
  const apiTag = await fetchLatestTagFromApi()
  if (apiTag) return apiTag
  return fetchLatestTagFromRedirect()
}

const normalizeVersion = (value: string): string | null => clean(value, { loose: true })

const normalizeTagToVersion = (tag: string): string | null => {
  const stripped = tag.replace(/^skillbook-/, '').replace(/^v/, '')
  return normalizeVersion(stripped)
}

const fetchLatestVersion = async (): Promise<string | null> => {
  const tag = await fetchLatestTag()
  if (!tag) return null
  return normalizeTagToVersion(tag)
}

const isNewerVersion = (current: string, latest: string): boolean => {
  if (current === 'dev') return false

  const normalizedCurrent = normalizeVersion(current)
  const normalizedLatest = normalizeVersion(latest)
  if (!normalizedCurrent || !normalizedLatest) return false

  return gt(normalizedLatest, normalizedCurrent)
}

export type UpdateCheckResult = {
  updateAvailable: boolean
  currentVersion: string
  latestVersion: string | null
}

export const checkForUpdate = async (skipCache = false): Promise<UpdateCheckResult> => {
  const cache = readCache()
  const now = Date.now()

  const cacheValid = cache && cache.latestVersion && now - cache.lastCheck < CHECK_INTERVAL_MS
  if (!skipCache && cacheValid) {
    return {
      updateAvailable: cache.latestVersion
        ? isNewerVersion(VERSION, cache.latestVersion)
        : false,
      currentVersion: VERSION,
      latestVersion: cache.latestVersion,
    }
  }

  const latestVersion = await fetchLatestVersion()

  writeCache({
    lastCheck: now,
    latestVersion,
  })

  return {
    updateAvailable: latestVersion ? isNewerVersion(VERSION, latestVersion) : false,
    currentVersion: VERSION,
    latestVersion,
  }
}

export const getPlatformBinary = (): string => {
  const platform = process.platform
  const arch = process.arch

  if (platform === 'darwin') {
    return arch === 'arm64' ? 'skillbook-darwin-arm64' : 'skillbook-darwin-x64'
  }

  if (platform === 'linux') {
    return arch === 'arm64' ? 'skillbook-linux-arm64' : 'skillbook-linux-x64'
  }

  throw new Error(`Unsupported platform: ${platform}-${arch}`)
}

export const getDownloadUrl = (tagOrVersion: string): string => {
  const binary = getPlatformBinary()
  if (tagOrVersion === 'latest') {
    return `https://github.com/${GITHUB_REPO}/releases/latest/download/${binary}`
  }

  const tag = tagOrVersion.startsWith('v') || tagOrVersion.startsWith('skillbook-')
    ? tagOrVersion
    : `v${tagOrVersion}`
  return `https://github.com/${GITHUB_REPO}/releases/download/${tag}/${binary}`
}

export const getInstallPath = (): string => {
  if (process.argv[0] && !process.argv[0].includes('bun')) {
    return process.argv[0]
  }

  return join(homedir(), '.local', 'bin', 'skillbook')
}
