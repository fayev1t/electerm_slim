const { test, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { DatabaseSync } = require('node:sqlite')
const { createDb } = require('../../app/lib/sqlite')
const { createElectermImporter } = require('../../app/lib/electerm-import')
const { enc: oldPassword } = require('../../app/common/pass-enc')

const contexts = []
const originalDataPath = process.env.DATA_PATH
delete process.env.DATA_PATH

const encrypt = value => 'v2:safe:' + Buffer.from(value).toString('base64')
const decrypt = value => value.startsWith('v2:safe:') ? Buffer.from(value.slice(8), 'base64').toString() : value

afterEach(() => {
  for (const context of contexts.splice(0)) {
    context.db.close()
    fs.rmSync(context.root, { recursive: true, force: true })
  }
  if (originalDataPath === undefined) delete process.env.DATA_PATH
  else process.env.DATA_PATH = originalDataPath
})

function setup (enc = encrypt, dec = decrypt) {
  delete process.env.DATA_PATH
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'electerm-slim-import-'))
  const source = path.join(root, 'electerm')
  const profile = path.join(source, 'users', 'default_user')
  fs.mkdirSync(profile, { recursive: true })
  const db = createDb(root, 'default_user', { enc, dec })
  const dataPath = path.join(root, 'electerm_slim')
  let runtimeConfig
  const importer = createElectermImporter({
    appDataPath: root,
    dataPath,
    db,
    decrypt: dec,
    getConfig: () => db.dbAction('data', 'findOne', { _id: 'userConfig' }),
    updateConfig: config => { runtimeConfig = config }
  })
  const context = { root, source, profile, dataPath, db, importer, runtime: () => runtimeConfig }
  contexts.push(context)
  return context
}

function sourceSqlite (profile, tables, encrypted = true) {
  for (const [name, rows] of Object.entries(tables)) {
    const file = path.join(profile, name === 'data' ? 'electerm_data.db' : 'electerm.db')
    const db = new DatabaseSync(file)
    db.exec(`CREATE TABLE IF NOT EXISTS "${name}" (_id TEXT PRIMARY KEY, data TEXT)`)
    for (const { _id, ...doc } of rows) {
      const payload = JSON.stringify(doc)
      db.prepare(`INSERT OR REPLACE INTO "${name}" VALUES (?, ?)`).run(_id, encrypted ? 'enc:' + encrypt(payload) : payload)
    }
    db.close()
  }
}

const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex')

test('detects the original default directory and imports encrypted SQLite content without modifying it', async () => {
  const c = setup()
  sourceSqlite(c.profile, {
    bookmarks: [{ _id: 'remote', host: 'server.example', password: oldPassword('secret'), passwordEncrypted: true }],
    profiles: [{ _id: 'auth', privateKey: 'private-key-content', passphrase: 'key-passphrase' }],
    history: [{ _id: 'history-1', host: 'server.example' }],
    aiChatHistory: [{ _id: 'chat-1', response: 'saved conversation' }],
    data: [{ _id: 'userConfig', fontSize: 21 }]
  })
  const sourceFiles = ['electerm.db', 'electerm_data.db'].map(name => path.join(c.profile, name))
  const before = sourceFiles.map(hash)
  assert.equal(c.importer.inspect().found, true)
  const result = await c.importer.importData()
  assert.deepEqual(sourceFiles.map(hash), before)
  const bookmark = await c.db.dbAction('bookmarks', 'findOne', { _id: 'remote' })
  assert.equal(bookmark.password, 'secret')
  assert.equal(bookmark.passwordEncrypted, undefined)
  assert.equal((await c.db.dbAction('profiles', 'findOne', { _id: 'auth' })).privateKey, 'private-key-content')
  assert.equal(result.counts.aiChatHistory, 1)
  assert.equal(c.runtime().fontSize, 21)
  const raw = new DatabaseSync(path.join(c.dataPath, 'users/default_user/electerm_slim.db'), { readOnly: true })
  assert.ok(!raw.prepare('SELECT data FROM bookmarks').get().data.includes('secret'))
  raw.close()
  assert.ok(fs.existsSync(path.join(result.backupPath, 'electerm_slim.db')))
  assert.ok(fs.existsSync(path.join(result.backupPath, 'electerm_slim_data.db')))
})

test('merges local items, group membership and order records and is repeatable', async () => {
  const c = setup()
  await c.db.dbAction('bookmarks', 'insert', { _id: 'local', host: 'local.example' })
  await c.db.dbAction('bookmarkGroups', 'insert', { _id: 'default', bookmarkIds: ['local'], bookmarkGroupIds: [] })
  await c.db.dbAction('data', 'insert', { _id: 'bookmarks:order', value: ['local'] })
  sourceSqlite(c.profile, {
    bookmarks: [{ _id: 'remote', host: 'remote.example' }],
    bookmarkGroups: [{ _id: 'default', bookmarkIds: ['remote'], bookmarkGroupIds: [] }],
    data: [{ _id: 'bookmarks:order', value: ['remote'] }]
  }, false)
  await c.importer.importData()
  await c.importer.importData()
  assert.equal((await c.db.dbAction('bookmarks', 'find')).length, 2)
  assert.deepEqual((await c.db.dbAction('bookmarkGroups', 'findOne', { _id: 'default' })).bookmarkIds, ['local', 'remote'])
  assert.deepEqual((await c.db.dbAction('data', 'findOne', { _id: 'bookmarks:order' })).value, ['remote', 'local'])
})

test('preserves this application authentication and runtime keys and moves old log paths', async () => {
  const c = setup()
  await c.db.dbAction('data', 'insert', { _id: 'userConfig', hashedPassword: 'local-hash', salt: 'local-salt', tokenElecterm: 'local-token', host: '127.0.0.1' })
  sourceSqlite(c.profile, {
    data: [
      { _id: 'userConfig', fontSize: 24, hashedPassword: 'old-hash', salt: 'old-salt', tokenElecterm: 'old-token', host: 'old-host', syncSetting: { autoSync: true }, sessionLogPath: path.join(c.source, 'session_logs') },
      { _id: 'version', value: '999.0.0' }
    ]
  })
  await c.db.dbAction('data', 'insert', { _id: 'version', value: '0.1.0' })
  await c.importer.importData()
  const config = c.runtime()
  assert.equal(config.hashedPassword, 'local-hash')
  assert.equal(config.salt, 'local-salt')
  assert.equal(config.tokenElecterm, 'local-token')
  assert.equal(config.host, '127.0.0.1')
  assert.equal(config.fontSize, 24)
  assert.equal(config.syncSetting.autoSync, false)
  assert.equal(config.sessionLogPath, path.join(c.dataPath, 'session_logs'))
  assert.equal((await c.db.dbAction('data', 'findOne', { _id: 'version' })).value, '0.1.0')
})

test('reads legacy NeDB updates, tombstones and encrypted documents as a read-only snapshot', async () => {
  const c = setup()
  const file = path.join(c.profile, 'electerm.bookmarks.nedb')
  fs.writeFileSync(file, [
    { $$indexCreated: { fieldName: 'host' } },
    { _id: 'remote', host: 'before.example' },
    { _id: 'deleted', host: 'removed.example' },
    { _id: 'deleted', $$deleted: true },
    { _id: 'remote', _encdata: 'enc:' + encrypt(JSON.stringify({ host: 'after.example', password: 'secret' })) }
  ].map(doc => JSON.stringify(doc)).join('\n') + '\n')
  const before = hash(file)
  await c.importer.importData(c.profile)
  assert.equal(hash(file), before)
  assert.equal((await c.db.dbAction('bookmarks', 'find')).length, 1)
  assert.equal((await c.db.dbAction('bookmarks', 'findOne', { _id: 'remote' })).host, 'after.example')
})

test('uses SQLite rather than stale NeDB files after an original upgrade', async () => {
  const c = setup()
  sourceSqlite(c.profile, { bookmarks: [{ _id: 'new', host: 'new.example' }] })
  fs.writeFileSync(path.join(c.profile, 'electerm.bookmarks.nedb'), JSON.stringify({ _id: 'stale', host: 'old.example' }))
  await c.importer.importData()
  assert.deepEqual((await c.db.dbAction('bookmarks', 'find')).map(doc => doc._id), ['new'])
})

test('an unreadable encrypted profile fails before any destination records change', async () => {
  const c = setup(encrypt, value => value)
  await c.db.dbAction('quickCommands', 'insert', { _id: 'local', command: 'pwd' })
  sourceSqlite(c.profile, { bookmarks: [{ _id: 'remote', password: 'secret' }] })
  await assert.rejects(c.importer.importData(), /无法解密/)
  assert.equal((await c.db.dbAction('bookmarks', 'find')).length, 0)
  assert.equal((await c.db.dbAction('quickCommands', 'find')).length, 1)
  assert.equal(fs.existsSync(path.join(c.dataPath, 'backups')), false)
})

test('missing and corrupt source folders leave local content intact', async () => {
  const c = setup()
  await c.db.dbAction('quickCommands', 'insert', { _id: 'local', command: 'pwd' })
  assert.equal(c.importer.inspect().found, false)
  await assert.rejects(c.importer.importData(), /没有找到/)
  fs.writeFileSync(path.join(c.profile, 'electerm.bookmarks.nedb'), '{invalid')
  await assert.rejects(c.importer.importData())
  assert.equal((await c.db.dbAction('quickCommands', 'find')).length, 1)
})

test('rejects its own destination even when it contains legacy-named files', async () => {
  const c = setup()
  fs.writeFileSync(path.join(c.dataPath, 'electerm.bookmarks.nedb'), JSON.stringify({ _id: 'bad' }))
  await assert.rejects(c.importer.importData(c.dataPath), /来源不能/)
})

test('a write failure rolls back both databases and keeps the pre-import backup', async () => {
  const c = setup(value => {
    if (value.includes('fail-this-write')) throw new Error('encryption failed')
    return encrypt(value)
  })
  await c.db.dbAction('data', 'insert', { _id: 'userConfig', fontSize: 16 })
  await assert.rejects(async () => c.db.importRecords({
    data: [{ _id: 'userConfig', fontSize: 30 }],
    bookmarks: [{ _id: 'first', host: 'first.example' }, { _id: 'bad', host: 'fail-this-write' }]
  }, path.join(c.dataPath, 'backups')), /encryption failed/)
  assert.equal((await c.db.dbAction('data', 'findOne', { _id: 'userConfig' })).fontSize, 16)
  assert.equal((await c.db.dbAction('bookmarks', 'find')).length, 0)
  const [backup] = fs.readdirSync(path.join(c.dataPath, 'backups'))
  const saved = new DatabaseSync(path.join(c.dataPath, 'backups', backup, 'electerm_slim_data.db'), { readOnly: true })
  assert.ok(saved.prepare('SELECT data FROM data WHERE _id = ?').get('userConfig').data.startsWith('enc:'))
  saved.close()
})

test('JSON exports use the same backup and merge flow and upgrade old bookmark fields', async () => {
  const c = setup()
  const file = path.join(c.root, 'export.json')
  fs.writeFileSync(file, JSON.stringify({
    bookmarks: [{ id: 'remote', host: 'remote.example', proxy: { proxyIp: '127.0.0.1', proxyPort: 1080, proxyType: 5 }, loginScript: 'pwd', loginScriptDelay: 12 }],
    config: { fontSize: 23, sessionLogPath: path.join(c.source, 'session_logs') }
  }))
  const result = await c.importer.importData(file)
  const bookmark = await c.db.dbAction('bookmarks', 'findOne', { _id: 'remote' })
  assert.equal(bookmark.proxy, 'socks5://127.0.0.1:1080')
  assert.deepEqual(bookmark.runScripts, [{ delay: 12, script: 'pwd' }])
  assert.equal(bookmark.loginScript, undefined)
  assert.equal(c.runtime().fontSize, 23)
  assert.ok(fs.existsSync(result.backupPath))
})
