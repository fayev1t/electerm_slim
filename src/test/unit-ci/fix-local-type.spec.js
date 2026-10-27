const { describe, test, before } = require('node:test')
const assert = require('node:assert/strict')
const { extname } = require('node:path')
const { registerHooks } = require('node:module')

// fix-local-type.js is renderer code: Vite resolves its extensionless imports,
// and constants.js pulls the logo in with a `?no-inline` PNG import. Do both
// here so the module loads in plain Node.
registerHooks({
  resolve (specifier, context, nextResolve) {
    if (specifier.endsWith('.png?no-inline')) {
      return { url: 'data:text/javascript,export default "logo.png"', shortCircuit: true }
    }
    if (specifier.startsWith('.') && !extname(specifier)) {
      return nextResolve(specifier + '.js', context)
    }
    return nextResolve(specifier, context)
  }
})

global.window = {
  et: { packInfo: { version: '0.0.0' } },
  pre: {},
  translate: txt => txt
}

let fixLocalType
let fixLocalTab

const addr = { host: '192.168.1.2', port: 22, username: 'root' }

// what the buggy builds saved when a bookmark was opened
const brokenEntry = (conn, extra = {}) => ({
  id: 'h-broken',
  time: 2000,
  count: 3,
  ...extra,
  tab: { title: 'server', ...conn, type: 'local' }
})

describe('fix-local-type', () => {
  before(async () => {
    const mod = await import('../../client/common/fix-local-type.js')
    fixLocalType = mod.default
    fixLocalTab = mod.fixLocalTab
  })

  test('a history tab gets the type of the bookmark at the same address', () => {
    for (const type of ['ssh', 'telnet', 'rdp', 'vnc', 'spice', 'ftp']) {
      const bookmarks = [{ id: 'b1', title: 'server', type, ...addr }]
      const [entry] = fixLocalType(bookmarks, [brokenEntry(addr)])
      assert.equal(entry.tab.type, type)
    }
  })

  test('without a typed bookmark at that address the tab becomes ssh', () => {
    const other = { ...addr, port: 2222 }
    const bookmarks = [
      { id: 'b1', type: 'telnet', ...other },
      { id: 'b2', ...addr }
    ]
    const [entry] = fixLocalType(bookmarks, [brokenEntry(addr)])
    assert.equal(entry.tab.type, 'ssh')
    const [quick] = fixLocalType([], [brokenEntry(other)])
    assert.equal(quick.tab.type, 'ssh')
  })

  test('a bookmark made from a broken entry is fixed in place', () => {
    const bookmarks = [
      { id: 'b1', type: 'telnet', ...addr },
      { id: 'b2', title: 'from history', type: 'local', ...addr },
      { id: 'b3', title: 'from history', type: 'local', ...addr, port: 2222 }
    ]
    fixLocalType(bookmarks, [])
    assert.deepEqual(bookmarks.map(b => b.type), ['telnet', 'telnet', 'ssh'])
  })

  test('local shells keep the local type', () => {
    const bookmarks = [{ id: 'local', type: 'local', title: 'bash' }]
    const history = [{ id: 'h1', time: 1, count: 1, tab: { type: 'local', title: 'bash' } }]
    assert.equal(fixLocalType(bookmarks, history), history)
    assert.equal(bookmarks[0].type, 'local')
    assert.equal(history[0].tab.type, 'local')
  })

  test('a fixed entry that now equals another one is merged into the newer position', () => {
    const good = { id: 'h-good', time: 1000, count: 2, tab: { title: 'server', ...addr, type: 'ssh' } }
    const bookmarks = [{ id: 'b1', title: 'server', type: 'ssh', ...addr }]

    const res = fixLocalType(bookmarks, [brokenEntry(addr), good])
    assert.equal(res.length, 1)
    assert.equal(res[0].id, 'h-broken')
    assert.equal(res[0].count, 5)
    assert.equal(res[0].time, 2000)

    const older = brokenEntry(addr, { time: 500, count: 1 })
    const res2 = fixLocalType(bookmarks, [{ ...good, count: 2 }, older])
    assert.deepEqual(res2.map(h => [h.id, h.count, h.time]), [['h-good', 3, 1000]])
  })

  test('duplicates the bug did not make are left alone', () => {
    const entry = id => ({ id, time: 1, count: 1, tab: { title: 'server', ...addr, type: 'ssh' } })
    const history = [entry('h1'), entry('h2'), brokenEntry({ ...addr, port: 2222 })]
    const res = fixLocalType([], history)
    assert.deepEqual(res.map(h => h.id), ['h1', 'h2', 'h-broken'])
    assert.equal(res[2].tab.type, 'ssh')
  })

  // what opening a tab and testing a connection call after applyProfileToTabs
  test('fixLocalTab fixes one tab in place and says whether it changed it', () => {
    const bookmarks = [
      // still broken, so it must not hand its local type back
      { id: 'b0', type: 'local', ...addr },
      { id: 'b1', type: 'telnet', ...addr }
    ]
    const tab = { title: 'server', ...addr, type: 'local' }
    assert.equal(fixLocalTab(tab, bookmarks), true)
    assert.equal(tab.type, 'telnet')

    const other = { ...addr, port: 2222, type: 'local' }
    assert.equal(fixLocalTab(other, bookmarks), true)
    assert.equal(other.type, 'ssh')

    for (const kept of [{ type: 'local', title: 'bash' }, { ...addr, type: 'rdp' }]) {
      const before = { ...kept }
      assert.equal(fixLocalTab(kept, bookmarks), false)
      assert.deepEqual(kept, before)
    }
  })
})
