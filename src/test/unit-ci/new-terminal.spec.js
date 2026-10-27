const { describe, test, before } = require('node:test')
const assert = require('node:assert/strict')
const { extname } = require('node:path')
const { registerHooks } = require('node:module')

// new-terminal.js is renderer code: Vite resolves its extensionless imports,
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

let newTerm
let newLocalTerm

describe('new-terminal', () => {
  before(async () => {
    const mod = await import('../../client/common/new-terminal.js')
    newTerm = mod.default
    newLocalTerm = mod.newLocalTerm
  })

  // store.onSelectBookmark, onSelectHistory, the bookmark form and the MCP
  // open-tab handler all build the tab this way
  const openBookmark = bookmark => ({
    ...bookmark,
    from: 'bookmarks',
    srcId: bookmark.id,
    ...newTerm(true, true)
  })

  test('opening a bookmark keeps its connection type', () => {
    for (const type of ['ssh', 'telnet', 'serial', 'rdp', 'vnc', 'spice', 'ftp']) {
      const tab = openBookmark({ id: 'b1', type, host: '192.168.1.2' })
      assert.equal(tab.type, type)
      assert.notEqual(tab.id, 'b1')
    }
  })

  test('a bookmark saved without a type is left for the backend to treat as ssh', () => {
    const tab = openBookmark({ id: 'b1', host: '192.168.1.2' })
    assert.equal(tab.type, undefined)
  })

  test('a blank new tab is a local terminal', () => {
    const tab = newLocalTerm()
    assert.equal(tab.type, 'local')
    assert.equal(tab.status, 'processing')
    assert.equal(tab.title, 'newTerminal')
    assert.ok(tab.id)
  })
})
