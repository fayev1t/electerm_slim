/**
 * run time contants
 */

const os = require('os')
const { resolve } = require('path')

const platform = os.platform()
const arch = os.arch()
const isWin = platform === 'win32'
const isMac = platform === 'darwin'
const isLinux = platform === 'linux'
const isArm = arch.includes('arm')

const { NODE_ENV, NODE_TEST } = process.env
const isDev = NODE_ENV === 'development'
const iconPath = resolve(
  __dirname,
  (
    isDev
      ? '../../assets/branding/images/electerm_slim-icon.png'
      : '../assets/images/electerm_slim-icon.png'
  )
)
const trayIconPath = resolve(
  __dirname,
  (
    isDev
      ? '../../assets/branding/images/electerm_slim-tray.png'
      : '../assets/images/electerm_slim-tray.png'
  )
)
const extIconPath = isDev
  ? '/node_modules/electerm-icons/icons/'
  : 'icons/'

const defaultUserName = require('./default-user-name')

module.exports = {
  isTest: !!NODE_TEST,
  isDev,
  isWin,
  isMac,
  isArm,
  isLinux,
  iconPath,
  trayIconPath,
  extIconPath,
  defaultUserName,
  minWindowWidth: 320,
  minWindowHeight: 400,
  defaultLang: 'en_us',
  tempDir: resolve(os.tmpdir(), 'electerm_slim'),
  homeOrTmp: os.homedir() || os.tmpdir(),
  packInfo: require(isDev ? '../../../package.json' : '../package.json')
}
