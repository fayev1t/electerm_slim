const log = require('../common/log')
const { appPath, defaultUserName } = require('../common/app-props')
const { safeEncrypt, safeDecrypt } = require('./safe-storage')
const fs = require('fs')
const { randomBytes } = require('crypto')
const { getProfilePaths } = require('../common/data-paths')

const { profilePath, storageKeyPath: keyFilePath } = getProfilePaths(appPath, defaultUserName)

let _cachedStorageKey = null

function getStorageKey () {
  if (_cachedStorageKey) return _cachedStorageKey
  let key = null
  try {
    if (fs.existsSync(keyFilePath)) {
      const enc = fs.readFileSync(keyFilePath, 'utf8').trim()
      const dec = safeDecrypt(enc)
      if (dec && dec !== enc) {
        key = dec
      } else if (dec && !enc.startsWith('v2:safe:')) {
        key = dec
      }
    }
  } catch (e) {
    log.error('[storage-key] read error:', e.message)
  }
  if (!key) {
    key = randomBytes(32).toString('base64')
    try {
      const dir = profilePath
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      const enc = safeEncrypt(key)
      fs.writeFileSync(keyFilePath, enc, 'utf8')
    } catch (e) {
      log.error('[storage-key] write error:', e.message)
    }
  }
  _cachedStorageKey = key
  return key
}

module.exports = { getStorageKey }
