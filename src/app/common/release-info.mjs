// GitHub may only have preview releases while the project is getting started.
export function selectRelease (data) {
  const releases = (Array.isArray(data) ? data : [data])
    .filter(release => release && !release.draft && /^v?\d+\.\d+\.\d+/.test(release.tag_name))
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))
  return releases.find(release => !release.prerelease) || releases[0]
}

export function findReleaseAsset (release, installSrc, name) {
  if (!installSrc) {
    return undefined
  }
  return release?.assets?.find(asset =>
    asset.name.startsWith(name + '-') && asset.name.endsWith(installSrc)
  )
}
