/**
 * app entry
 */
const { app: electronApp, dialog } = require('electron')
const constants = require('./common/runtime-constants')
require('./lib/init-data-paths').initDataPaths(electronApp, constants, require('./lib/install-src'))
const log = require('./common/log')
const { createApp } = require('./lib/create-app')
const globalState = require('./lib/glob-state')

globalState.set('initTime', Date.now())

log.debug('electerm_slim start')

// createApp() is async, so anything thrown inside it (a failed require, an
// unreadable config, a bad platform integration) used to surface only as an
// UnhandledPromiseRejection while the app silently never opened a window.
// Fail loudly instead, so the next one of these is diagnosable from the message.
const app = createApp().catch((err) => {
  log.error('Failed to start electerm_slim:', err)
  try {
    dialog.showErrorBox(
      'electerm_slim',
      `Failed to start electerm_slim:\n\n${err?.stack || err}`
    )
  } catch (_) {}
  process.exit(1)
})
globalState.set('app', app)
