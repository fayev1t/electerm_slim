const path = require('path')
const { resolve } = path

const appName = 'electerm_slim'

function getDataPath (appPath, env = process.env) {
  return env.DATA_PATH ? resolve(env.DATA_PATH) : resolve(appPath, appName)
}

function getProfilePaths (appPath, userName, env = process.env) {
  const dataPath = getDataPath(appPath, env)
  const profilePath = resolve(dataPath, 'users', userName)
  return {
    dataPath,
    profilePath,
    mainDbPath: resolve(profilePath, appName + '.db'),
    dataDbPath: resolve(profilePath, appName + '_data.db'),
    storageKeyPath: resolve(profilePath, 'storage-key.enc')
  }
}

function getAppPaths (app, { isWin, installSrc, env = process.env, existsSync }) {
  const paths = isWin ? path.win32 : path
  const exePath = isWin ? paths.dirname(app.getPath('exe')) : undefined
  const isPortable = !!(isWin && (
    installSrc.includes('portable') || existsSync(paths.resolve(exePath, appName))
  ))
  const appPath = isPortable ? exePath : app.getPath('appData')
  const dataPath = env.DATA_PATH ? paths.resolve(env.DATA_PATH) : paths.resolve(appPath, appName)
  return { appPath, dataPath, exePath, isPortable }
}

module.exports = { appName, getDataPath, getProfilePaths, getAppPaths }
