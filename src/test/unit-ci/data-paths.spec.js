const { test, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { getDataPath, getProfilePaths, getAppPaths } = require('../../app/common/data-paths')
const { initDataPaths } = require('../../app/lib/init-data-paths')

const folders = []
const previous = { DATA_PATH: process.env.DATA_PATH, ELECTERM_SLIM_DATA_PATH: process.env.ELECTERM_SLIM_DATA_PATH }

afterEach(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  for (const folder of folders.splice(0)) fs.rmSync(folder, { recursive: true, force: true })
})

test('database files and keys live under the slim profile', () => {
  const base = path.join(os.tmpdir(), 'app-data')
  const paths = getProfilePaths(base, 'alice', {})
  assert.equal(paths.dataPath, path.join(base, 'electerm_slim'))
  assert.equal(paths.mainDbPath, path.join(base, 'electerm_slim/users/alice/electerm_slim.db'))
  assert.equal(paths.dataDbPath, path.join(base, 'electerm_slim/users/alice/electerm_slim_data.db'))
  assert.equal(paths.storageKeyPath, path.join(base, 'electerm_slim/users/alice/storage-key.enc'))
})

test('DATA_PATH is one explicit root rather than another nested application folder', () => {
  assert.equal(getDataPath('/tmp/app-data', { DATA_PATH: '/tmp/slim-custom' }), path.resolve('/tmp/slim-custom'))
  assert.equal(getProfilePaths('/tmp/app-data', 'alice', { DATA_PATH: '/tmp/slim-custom' }).profilePath, path.resolve('/tmp/slim-custom/users/alice'))
})

test('Windows portable detection uses only its own folder', () => {
  const app = { getPath: name => name === 'exe' ? 'C:\\Apps\\electerm_slim.exe' : 'C:\\Users\\me\\AppData\\Roaming' }
  const options = { isWin: true, installSrc: 'win-x64-installer.exe', env: {}, existsSync: file => file === 'C:\\Apps\\electerm' }
  const installed = getAppPaths(app, options)
  assert.equal(installed.isPortable, false)
  assert.equal(installed.dataPath, 'C:\\Users\\me\\AppData\\Roaming\\electerm_slim')
  const portable = getAppPaths(app, { ...options, existsSync: file => file === 'C:\\Apps\\electerm_slim' })
  assert.equal(portable.isPortable, true)
  assert.equal(portable.dataPath, 'C:\\Apps\\electerm_slim')
})

test('Chromium, application logs and backend logs get an independent root before startup', () => {
  delete process.env.DATA_PATH
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'electerm-slim-paths-'))
  folders.push(root)
  const calls = []
  const app = {
    setName: name => calls.push(['name', name]),
    getPath: () => root,
    setPath: (key, value) => calls.push([key, value]),
    setAppLogsPath: value => calls.push(['logs', value])
  }
  const dataPath = initDataPaths(app, { isWin: false, tempDir: path.join(root, 'temp') }, 'linux-x64.tar.gz', [])
  assert.deepEqual(calls[0], ['name', 'electerm_slim'])
  assert.ok(calls.some(([key, value]) => key === 'userData' && value === path.join(dataPath, 'electron')))
  assert.ok(calls.some(([key, value]) => key === 'sessionData' && value === path.join(dataPath, 'electron')))
  assert.ok(calls.some(([key, value]) => key === 'logs' && value === path.join(dataPath, 'logs')))
  assert.equal(process.env.ELECTERM_SLIM_DATA_PATH, dataPath)
  assert.equal(fs.existsSync(path.join(root, 'electerm')), false)
})

test('an explicit Chromium profile override remains isolated and is respected', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'electerm-slim-paths-'))
  folders.push(root)
  process.env.DATA_PATH = path.join(root, 'custom-data')
  const app = {
    setName: () => {},
    getPath: () => root,
    setPath: () => assert.fail('must not replace --user-data-dir'),
    setAppLogsPath: value => assert.equal(value, path.join(root, 'custom-data', 'logs'))
  }
  initDataPaths(app, { isWin: false, tempDir: path.join(root, 'temp') }, 'linux-x64.tar.gz', ['--user-data-dir=/tmp/my-profile'])
  assert.equal(process.env.ELECTERM_SLIM_DATA_PATH, path.join(root, 'custom-data'))
})
