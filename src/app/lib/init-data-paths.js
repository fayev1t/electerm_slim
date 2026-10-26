const fs = require('fs')
const { resolve } = require('path')
const { appName, getAppPaths } = require('../common/data-paths')

function initDataPaths (app, constants, installSrc, argv = process.argv) {
  app.setName(appName)
  const { dataPath } = getAppPaths(app, {
    isWin: constants.isWin,
    installSrc,
    existsSync: fs.existsSync
  })
  // Explicit Chromium profile overrides are used by isolated runs and tests.
  const hasProfileOverride = argv.some(arg => arg === '--user-data-dir' || arg.startsWith('--user-data-dir='))
  if (!hasProfileOverride) {
    const userDataPath = resolve(dataPath, 'electron')
    fs.mkdirSync(userDataPath, { recursive: true })
    app.setPath('userData', userDataPath)
    app.setPath('sessionData', userDataPath)
  }
  const logsPath = resolve(dataPath, 'logs')
  fs.mkdirSync(logsPath, { recursive: true })
  fs.mkdirSync(constants.tempDir, { recursive: true })
  app.setAppLogsPath(logsPath)
  // The forked backend has no Electron app object, so it inherits this root.
  process.env.ELECTERM_SLIM_DATA_PATH = dataPath
  return dataPath
}

module.exports = { initDataPaths }
