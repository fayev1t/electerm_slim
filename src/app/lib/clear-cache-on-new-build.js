/**
 * drop the renderer's HTTP cache when a new build is installed
 */

const fs = require('fs/promises')

// file-server.js lets the window cache assets for a year, and only the chunk
// files carry a content hash: index.html and the entry bundles keep the same
// URL in every build of one version. So after installing a new build of the
// same version, the window kept running the old UI from the cache. Clear the
// cache once each time the build changes.
async function clearCacheOnNewBuild (session, buildTime, markerPath) {
  if (!buildTime) {
    return false
  }
  const last = await fs.readFile(markerPath, 'utf8').catch(() => '')
  if (last === String(buildTime)) {
    return false
  }
  await session.clearCache()
  await fs.writeFile(markerPath, String(buildTime))
  return true
}

module.exports = { clearCacheOnNewBuild }
