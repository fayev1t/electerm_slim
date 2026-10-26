const fs = require('fs')
const path = require('path')
const { dec } = require('../common/pass-enc')
const { serverManagedConfigKeys } = require('../common/constants')
const { buildProxyString } = require('./build-proxy')
const { buildSshTunnels } = require('../common/build-ssh-tunnel')
const { buildRunScripts } = require('../common/build-run-scripts')

const contentTables = [
  'bookmarks', 'bookmarkGroups', 'addressBookmarks', 'terminalThemes',
  'quickCommands', 'profiles', 'workspaces', 'triggers', 'history',
  'terminalCommandHistory', 'aiChatHistory'
]
const importTables = [...contentTables, 'data']

function parseJson (text, reviver) {
  try {
    return JSON.parse(text, reviver)
  } catch {
    throw new Error('electerm 数据文件格式损坏，无法导入。请尝试从原程序重新导出 JSON。')
  }
}

function isJsonExport (source) {
  return fs.existsSync(source) && fs.statSync(source).isFile() && path.extname(source).toLowerCase() === '.json'
}

function readJsonExport (source, decrypt) {
  const data = parseJson(fs.readFileSync(source, 'utf8'))
  if (!data || Array.isArray(data) || typeof data !== 'object') {
    throw new Error('请选择 electerm 导出的完整 JSON 文件')
  }
  if (data.config !== undefined && (!data.config || Array.isArray(data.config) || typeof data.config !== 'object')) {
    throw new Error('配置数据格式无效')
  }
  if (!contentTables.some(table => Array.isArray(data[table])) && !data.config) {
    throw new Error('请选择 electerm 导出的完整 JSON 文件')
  }
  const records = {}
  for (const table of contentTables) {
    if (data[table] !== undefined && !Array.isArray(data[table])) throw new Error(`无效的 ${table} 数据`)
    if (data[table]) records[table] = data[table].map(doc => ({ ...decodeValue(doc, decrypt), _id: doc._id || doc.id }))
  }
  records.data = data.config ? [{ ...decodeValue(data.config, decrypt), _id: 'userConfig' }] : []
  return records
}

function findProfile (directory) {
  for (const candidate of [
    path.join(directory, 'users', 'default_user'),
    path.join(directory, 'default_user'),
    directory
  ]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory() &&
      fs.readdirSync(candidate).some(name => /^electerm(?:_data)?\.db$|^electerm\..+\.nedb$/.test(name))) {
      return fs.realpathSync(candidate)
    }
  }
}

function decodeValue (value, decrypt) {
  if (typeof value === 'string' && value.startsWith('v2:safe:')) {
    const result = decrypt(value)
    if (typeof result !== 'string' || result.startsWith('v2:safe:')) {
      throw new Error('无法解密 electerm 数据。请使用原来的系统账户导入；也可在 electerm 中导出 JSON，再通过“从文件导入”迁移。')
    }
    return result
  }
  if (Array.isArray(value)) return value.map(item => decodeValue(item, decrypt))
  if (!value || typeof value !== 'object' || value instanceof Date) return value
  const result = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeValue(item, decrypt)]))
  if (result.passwordEncrypted && typeof result.password === 'string') {
    result.password = dec(result.password)
    delete result.passwordEncrypted
  }
  return result
}

function decodePayload (value, decrypt) {
  const raw = value.startsWith('enc:') ? value.slice(4) : value
  const decoded = parseJson(decodeValue(raw, decrypt))
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
    throw new Error('electerm 数据格式无效')
  }
  return decodeValue(decoded, decrypt)
}

function readSqlite (profile, decrypt) {
  const { DatabaseSync } = require('node:sqlite')
  const records = {}
  // A SQLite profile takes precedence over leftover NeDB migration files.
  for (const [name, tables] of [
    ['electerm.db', contentTables],
    ['electerm_data.db', ['data']]
  ]) {
    const file = path.join(profile, name)
    if (!fs.existsSync(file)) continue
    const db = new DatabaseSync(file, { readOnly: true })
    try {
      db.exec('BEGIN')
      const available = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name))
      for (const table of tables) {
        if (!available.has(table)) continue
        records[table] = db.prepare(`SELECT _id, data FROM "${table}"`).all().map(row => ({
          ...decodePayload(row.data, decrypt),
          _id: row._id
        }))
      }
    } finally {
      db.close()
    }
  }
  return records
}

function readNedb (profile, decrypt) {
  const records = {}
  for (const table of importTables) {
    const file = path.join(profile, `electerm.${table}.nedb`)
    if (!fs.existsSync(file)) continue
    const docs = new Map()
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue
      const doc = parseJson(line, (key, value) => value && typeof value === 'object' && Object.hasOwn(value, '$$date') ? new Date(value.$$date) : value)
      if (doc.$$indexCreated || doc.$$indexRemoved) continue
      if (!doc._id) throw new Error(`electerm ${table} 数据缺少记录标识`)
      if (doc.$$deleted) {
        docs.delete(doc._id)
      } else {
        docs.set(doc._id, doc._encdata
          ? { ...decodePayload(doc._encdata, decrypt), _id: doc._id }
          : decodeValue(doc, decrypt))
      }
    }
    records[table] = [...docs.values()]
  }
  return records
}

function prepareRecords (records, localConfig, sourceRoot, dataPath) {
  const config = {
    ...(records.data || []).find(doc => doc._id === 'userConfigNoEncrypt'),
    ...(records.data || []).find(doc => doc._id === 'userConfig')
  }
  for (const key of [...serverManagedConfigKeys, '_id', 'id', 'hashedPassword', 'salt', 'requireAuth']) {
    delete config[key]
  }
  if (config.syncSetting) config.syncSetting = { ...config.syncSetting, autoSync: false }
  // Imported log locations inside the old application's tree must stay separate.
  function remapLog (doc) {
    if (typeof doc.sessionLogPath !== 'string' || !doc.sessionLogPath) return doc
    const relative = path.relative(sourceRoot, doc.sessionLogPath)
    if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
      return { ...doc, sessionLogPath: path.join(dataPath, 'session_logs') }
    }
    return doc
  }
  const result = {}
  for (const table of contentTables) {
    if (!records[table]) continue
    result[table] = records[table].map(doc => remapLog({ ...doc, _id: doc._id || doc.id }))
  }
  for (const bookmark of result.bookmarks || []) {
    if (typeof bookmark.proxy !== 'string') bookmark.proxy = buildProxyString(bookmark.proxy || {})
    if (bookmark.sshTunnel) {
      bookmark.sshTunnels = buildSshTunnels(bookmark)
      delete bookmark.sshTunnel
      delete bookmark.sshTunnelRemotePort
      delete bookmark.sshTunnelLocalPort
    }
    if (bookmark.loginScript) {
      bookmark.runScripts = buildRunScripts(bookmark)
      delete bookmark.loginScript
      delete bookmark.loginScriptDelay
    }
  }
  for (const theme of result.terminalThemes || []) {
    if (!theme.uiThemeConfig) {
      theme.uiThemeConfig = require('../upgrade/db-defaults').find(item => item.db === 'terminalThemes').data[0].uiThemeConfig
    }
  }
  result.data = (records.data || []).filter(doc =>
    doc._id !== 'userConfig' && doc._id !== 'userConfigNoEncrypt' &&
    doc._id !== 'version' && doc._id !== 'lastDataUpdateTime'
  )
  result.data.push({ ...localConfig, ...remapLog(config), _id: 'userConfig' })
  result.data.push({ _id: 'userConfigNoEncrypt', allowMultiInstance: result.data.at(-1).allowMultiInstance || false })
  return result
}

function createElectermImporter ({ appDataPath, dataPath, db, decrypt, getConfig, updateConfig, legacyPaths = [] }) {
  let importing = false
  const sources = [...legacyPaths, path.join(appDataPath, 'electerm')]
  const defaultSource = () => sources.find(source => findProfile(source)) || sources[sources.length - 1]

  function inspect (source = defaultSource()) {
    const profile = isJsonExport(source) ? source : findProfile(source)
    return { sourcePath: source, profilePath: profile || '', found: !!profile, dataPath }
  }

  async function importData (source = defaultSource()) {
    if (importing) throw new Error('正在导入，请稍候')
    importing = true
    try {
      if (typeof db.importRecords !== 'function') throw new Error('请更新 electerm_slim 后直接导入，或使用 electerm 导出的 JSON 文件。')
      const json = isJsonExport(source)
      const profile = json ? source : findProfile(source)
      if (!profile) throw new Error('没有找到 electerm 数据，请选择原数据目录，或使用 electerm 导出的 JSON 文件。')
      const target = fs.realpathSync(dataPath)
      const relative = path.relative(target, profile)
      if (!json && (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)))) {
        throw new Error('来源不能是 electerm_slim 当前的数据目录')
      }
      const sqlite = fs.existsSync(path.join(profile, 'electerm.db')) || fs.existsSync(path.join(profile, 'electerm_data.db'))
      let records
      if (json) records = readJsonExport(source, decrypt)
      else if (sqlite) records = readSqlite(profile, decrypt)
      else records = readNedb(profile, decrypt)
      let sourceRoot = source
      if (json) sourceRoot = path.join(appDataPath, 'electerm')
      else if (path.basename(path.dirname(profile)) === 'users') sourceRoot = path.dirname(path.dirname(profile))
      const localConfig = await db.dbAction('data', 'findOne', { _id: 'userConfig' }) || {}
      const prepared = prepareRecords(records, localConfig, sourceRoot, dataPath)
      if (!Object.values(records).some(rows => rows.length)) throw new Error('electerm 数据目录中没有可导入的内容')
      const result = await db.importRecords(prepared, path.join(dataPath, 'backups'))
      const config = await getConfig()
      updateConfig(config)
      return { ...result, config, sourcePath: sourceRoot }
    } finally {
      importing = false
    }
  }

  return { inspect, importData }
}

module.exports = { createElectermImporter, contentTables }
