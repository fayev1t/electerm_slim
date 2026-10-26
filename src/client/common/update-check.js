/**
 * Check this project's GitHub Releases for updates.
 */
import fetch from './fetch-from-server'
import { packInfo } from './constants'
import { selectRelease, findReleaseAsset } from '../../app/common/release-info.mjs'
import dayjs from 'dayjs'

async function getRelease () {
  try {
    const data = await fetch({
      action: 'fetch',
      options: {
        url: packInfo.releaseApiUrl,
        headers: { Accept: 'application/vnd.github+json' },
        timeout: 15000
      },
      proxy: window.store.getProxySetting()
    })
    return selectRelease(data)
  } catch {
    return undefined
  }
}

export async function getLatestReleaseVersion () {
  return getRelease()
}

export function getDownloadUrl (browserDownloadUrl) {
  return browserDownloadUrl || ''
}

export async function getLatestReleaseInfo (release) {
  release = release || await getRelease()
  if (!release) {
    return undefined
  }
  const asset = findReleaseAsset(release, window.store.installSrc, packInfo.name)
  return {
    body: release.body || '',
    date: dayjs(release.published_at).format('YYYY-MM-DD'),
    browserDownloadUrl: asset?.browser_download_url || ''
  }
}
