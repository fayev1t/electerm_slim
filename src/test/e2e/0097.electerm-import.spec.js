const { _electron: electron, test, expect } = require('@playwright/test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { DatabaseSync } = require('node:sqlite')
const appOptions = require('./common/app-options')

test.setTimeout(60000)
test.skip(process.platform !== 'linux', 'The default-folder fixture uses XDG_CONFIG_HOME on Linux')

function writeRows (file, table, rows) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec(`CREATE TABLE IF NOT EXISTS "${table}" (_id TEXT PRIMARY KEY, data TEXT)`)
  for (const { _id, ...doc } of rows) {
    db.prepare(`INSERT OR REPLACE INTO "${table}" VALUES (?, ?)`).run(_id, JSON.stringify(doc))
  }
  db.close()
}

const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

test('one click imports original data into an independent profile and survives a restart', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'electerm-slim-import-ui-'))
  const appData = path.join(root, 'config')
  const dataPath = path.join(appData, 'electerm_slim')
  const sourceProfile = path.join(appData, 'electerm/users/default_user')
  const sourceMain = path.join(sourceProfile, 'electerm.db')
  const sourceConfig = path.join(sourceProfile, 'electerm_data.db')
  writeRows(sourceMain, 'bookmarks', [{ _id: 'legacy-bookmark', title: 'Imported SSH', type: 'ssh', host: 'import.example', username: 'alice', password: 'migration-secret' }])
  writeRows(sourceMain, 'bookmarkGroups', [{ _id: 'default', bookmarkIds: ['legacy-bookmark'], bookmarkGroupIds: [] }])
  writeRows(sourceMain, 'history', [{ _id: 'legacy-history', host: 'history.example' }])
  writeRows(sourceMain, 'terminalCommandHistory', [{ _id: 'legacy-command', command: 'uptime' }])
  writeRows(sourceConfig, 'data', [{ _id: 'userConfig', fontSize: 19, allowMultiInstance: true, initDefaultTabOnStart: false, checkUpdateOnStart: false, syncSetting: { autoSync: true } }])
  const originalKey = path.join(sourceProfile, 'storage-key.enc')
  fs.writeFileSync(originalKey, 'original-electerm-key')
  const targetConfig = path.join(dataPath, 'users/default_user/electerm_slim_data.db')
  writeRows(targetConfig, 'data', [{ _id: 'userConfigNoEncrypt', allowMultiInstance: true }])
  const env = { ...appOptions.env, XDG_CONFIG_HOME: appData }
  delete env.DATA_PATH
  delete env.ELECTERM_SLIM_DATA_PATH
  const options = { ...appOptions, env, args: appOptions.args.filter(arg => !arg.startsWith('--user-data-dir=')) }
  let app
  try {
    app = await electron.launch(options)
    const page = await app.firstWindow()
    await page.waitForFunction(() => window.store?.configLoaded)
    await page.setViewportSize({ width: 1200, height: 850 })
    const paths = await app.evaluate(({ app }) => ({ userData: app.getPath('userData'), sessionData: app.getPath('sessionData'), logs: app.getPath('logs') }))
    expect(paths.userData).toBe(path.join(dataPath, 'electron'))
    expect(paths.sessionData).toBe(paths.userData)
    expect(paths.logs).toBe(path.join(dataPath, 'logs'))
    expect(await page.evaluate(() => window.store.dataPath)).toBe(dataPath)

    // Exercise real OS encryption for the source and destination database rows.
    const encrypted = await page.evaluate(() => window.pre.runGlobalAsync('safeEncrypt', JSON.stringify({ title: 'Imported SSH', type: 'ssh', host: 'import.example', username: 'alice', password: 'migration-secret' })))
    const source = new DatabaseSync(sourceMain)
    source.prepare('UPDATE bookmarks SET data = ? WHERE _id = ?').run('enc:' + encrypted, 'legacy-bookmark')
    source.close()
    const before = [hash(sourceMain), hash(sourceConfig)]

    await page.evaluate(async () => {
      const { store } = window
      store.addItem({ id: 'local-bookmark', title: 'Existing SSH', type: 'ssh', host: 'local.example' }, 'bookmarks')
      await new Promise(resolve => setTimeout(resolve, 300))
      store.openSettingSync()
    })
    const panel = page.locator('.electerm-import')
    await expect(panel).toBeVisible()
    await expect(panel).toContainText(sourceProfile)
    await expect(panel.locator('.import-electerm-button')).toBeEnabled()
    const token = await page.evaluate(() => window.store.config.tokenElecterm)
    await panel.locator('.import-electerm-button').click()
    await expect(panel.locator('.electerm-import-success')).toBeVisible()
    await page.waitForFunction(() => window.store.bookmarks.some(item => item.id === 'legacy-bookmark'))
    const imported = await page.evaluate(() => ({
      bookmarks: window.store.bookmarks.filter(item => ['local-bookmark', 'legacy-bookmark'].includes(item.id)),
      fontSize: window.store.config.fontSize,
      autoSync: window.store.config.syncSetting.autoSync,
      token: window.store.config.tokenElecterm,
      migrating: window.migrating,
      history: window.store.history.some(item => item.id === 'legacy-history'),
      command: window.store.terminalCommandHistory.some(item => item.id === 'legacy-command')
    }))
    expect(imported.bookmarks).toHaveLength(2)
    expect(imported.bookmarks.find(item => item.id === 'legacy-bookmark').password).toBe('migration-secret')
    expect(imported.fontSize).toBe(19)
    expect(imported.autoSync).toBe(false)
    expect(imported.token).toBe(token)
    expect(imported.migrating).toBe(false)
    expect(imported.history).toBe(true)
    expect(imported.command).toBe(true)
    expect([hash(sourceMain), hash(sourceConfig)]).toEqual(before)
    expect(fs.readdirSync(path.join(dataPath, 'backups')).length).toBe(1)
    // This key is generated on demand by encrypted browser preferences.
    expect(await page.evaluate(() => !!window.pre.runSync('getStorageKey'))).toBe(true)
    const ownKey = path.join(dataPath, 'users/default_user/storage-key.enc')
    expect(fs.existsSync(ownKey)).toBe(true)
    expect(fs.readFileSync(originalKey, 'utf8')).toBe('original-electerm-key')
    expect(fs.readFileSync(ownKey, 'utf8')).not.toBe('original-electerm-key')

    // Watchers must retain the imported records after subsequent local edits.
    await page.evaluate(() => window.store.addItem({ id: 'after-import', title: 'After import', type: 'ssh', host: 'after.example' }, 'bookmarks'))
    await expect.poll(() => page.evaluate(async () => (await window.pre.runGlobalAsync('dbAction', 'bookmarks', 'findOne', { _id: 'after-import' }))?.host)).toBe('after.example')
    const screenshotDir = process.env.ELECTERM_SLIM_SCREENSHOT_DIR
    if (screenshotDir) {
      fs.mkdirSync(screenshotDir, { recursive: true })
      await page.screenshot({ path: path.join(screenshotDir, 'electerm_slim-导入配置.png') })
    }
    await app.close()
    app = await electron.launch(options)
    const reopened = await app.firstWindow()
    await reopened.waitForFunction(() => window.store?.configLoaded)
    expect(await reopened.evaluate(() => window.store.bookmarks.find(item => item.id === 'legacy-bookmark')?.password)).toBe('migration-secret')
    expect(await reopened.evaluate(() => window.store.bookmarks.some(item => item.id === 'after-import'))).toBe(true)
    expect([hash(sourceMain), hash(sourceConfig)]).toEqual(before)
  } finally {
    await app?.close().catch(() => {})
    fs.rmSync(root, { recursive: true, force: true })
  }
})
