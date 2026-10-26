/**
 * app path
 */
const { app } = require('electron')
const { resolve } = require('path')
const { getAppPaths } = require('./data-paths')
const constants = require('./runtime-constants')
const installSrc = require('../lib/install-src')

module.exports = {
  ...getAppPaths(app, { isWin: constants.isWin, installSrc, existsSync: require('fs').existsSync }),
  sshKeysPath: resolve(
    app.getPath('home'),
    '.ssh'
  ),
  ...constants
}
