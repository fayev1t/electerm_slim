const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const filename = path.resolve(__dirname, '../../app/server/session-process.js')
const source = fs.readFileSync(filename, 'utf8')

function createHarness ({ onStart, onSend } = {}) {
  const children = []
  const timers = new Map()
  const api = {}
  function fork (filename, options) {
    const child = new EventEmitter()
    child.options = options
    child.killed = false
    child.kill = () => {
      child.killed = true
      queueMicrotask(() => child.emit('exit', 0, 'SIGTERM'))
    }
    child.send = (message, callback) => {
      if (onSend) {
        onSend(child, message, callback)
        return
      }
      queueMicrotask(() => {
        callback?.(null)
        child.emit('message', { id: message.data.id, data: true })
      })
    }
    children.push(child)
    queueMicrotask(() => {
      if (onStart) {
        onStart(child)
      } else {
        child.emit('message', { serverInited: true, port: 41000 + children.indexOf(child) })
      }
    })
    return child
  }

  vm.runInNewContext(source, {
    exports: api,
    require: name => name === 'child_process' ? { fork } : require(name),
    __dirname: path.dirname(filename),
    process: {
      env: { ELECTRON_RUN_AS_NODE: '1', wsPort: '30976', type: 'inherited-type' },
      cwd: () => process.cwd(),
      on () {}
    },
    setTimeout: (callback, delay) => {
      const timer = { unref () {} }
      timers.set(timer, { callback, delay })
      return timer
    },
    clearTimeout: timer => timers.delete(timer)
  }, { filename })
  return { api, children, timers }
}

function openTerminal (api, uid = 'session') {
  return api.terminal({ type: 'local', uid }, null, `request-${uid}`)
}

describe('session process startup', () => {
  test('uses the listening port reported by the child instead of probing a fixed range', async () => {
    const { api, children, timers } = createHarness()
    try {
      const result = await openTerminal(api)
      assert.equal(result.port, 41000)
      assert.equal(result.pid, 'session')
      assert.equal(children[0].options.env.wsPort, '0')
      assert.equal(children[0].options.env.type, 'local')
      assert.equal(children[0].options.env.ELECTRON_RUN_AS_NODE, undefined)
      assert.equal(timers.size, 0)
    } finally {
      api.cleanupTerminals()
    }
  })

  test('keeps concurrently opened sessions on their own reported ports', async () => {
    const { api } = createHarness()
    try {
      const results = await Promise.all([
        openTerminal(api, 'first'),
        openTerminal(api, 'second'),
        openTerminal(api, 'third')
      ])
      assert.equal(new Set(results.map(result => result.port)).size, 3)
    } finally {
      api.cleanupTerminals()
    }
  })

  test('reports a bind failure immediately and reaps the failed child', async () => {
    const { api, children, timers } = createHarness({
      onStart: child => child.emit('message', {
        serverError: { message: 'listen EADDRINUSE', code: 'EADDRINUSE' }
      })
    })
    await assert.rejects(openTerminal(api), { message: 'listen EADDRINUSE', code: 'EADDRINUSE' })
    assert.equal(children[0].killed, true)
    assert.equal(timers.size, 0)
  })

  test('settles a failed spawn instead of waiting forever for readiness', async () => {
    const { api, children } = createHarness({
      onStart: child => child.emit('error', new Error('spawn ENOENT'))
    })
    await assert.rejects(openTerminal(api), /spawn ENOENT/)
    assert.equal(children[0].killed, true)
  })

  test('settles a child exit before readiness', async () => {
    const { api } = createHarness({
      onStart: child => child.emit('exit', 1, null)
    })
    await assert.rejects(openTerminal(api), /exited before starting \(1\)/)
  })

  test('bounds startup when a child never reports readiness', async () => {
    const { api, children, timers } = createHarness({ onStart () {} })
    const rejected = assert.rejects(openTerminal(api), /did not start within 30000ms/)
    const timeout = [...timers.values()].find(timer => timer.delay === 30000)
    timeout.callback()
    await rejected
    assert.equal(children[0].killed, true)
    assert.equal(timers.size, 0)
  })

  test('rejects readiness without a usable listening port', async () => {
    const { api } = createHarness({
      onStart: child => child.emit('message', { serverInited: true, port: 0 })
    })
    await assert.rejects(openTerminal(api), /valid listening port/)
  })

  test('settles IPC send errors and reaps the child', async () => {
    const { api, children } = createHarness({
      onSend: (child, message, callback) => callback(new Error('IPC channel is closed'))
    })
    await assert.rejects(openTerminal(api), /IPC channel is closed/)
    assert.equal(children[0].killed, true)
  })

  test('settles creation if the ready child exits before answering', async () => {
    const { api } = createHarness({
      onSend: child => child.emit('exit', 1, null)
    })
    await assert.rejects(openTerminal(api), /exited before responding/)
  })

  test('keeps a replacement session registered when the old child exits', async () => {
    const { api, children } = createHarness()
    try {
      await openTerminal(api)
      const replacement = await openTerminal(api)
      await Promise.resolve()
      assert.equal(children[0].killed, true)
      assert.equal(children[1].killed, false)
      assert.equal(replacement.port, 41001)
      assert.ok(api.terminals('session'))
    } finally {
      api.cleanupTerminals()
    }
  })

  test('reaps a connection-test process when its request fails', async () => {
    const { api, children, timers } = createHarness({
      onSend: (child, message) => child.emit('message', {
        id: message.data.id,
        error: { message: 'test connection failed' }
      })
    })
    await assert.rejects(
      api.testConnection({ type: 'local' }, null, 'test-request'),
      { message: 'test connection failed' }
    )
    assert.equal(children[0].killed, true)
    assert.equal(timers.size, 0)
  })
})
