const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { fork } = require('node:child_process')
const { once } = require('node:events')
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const { terminal, cleanupTerminals } = require('../../app/server/session-process')
const nodeCompat = path.resolve(__dirname, 'lib/session-node-compat.js')

async function listen (port = 0) {
  const server = net.createServer(socket => socket.destroy())
  server.listen(port, '127.0.0.1')
  await once(server, 'listening')
  return server
}

function waitForStartup (child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', code => reject(new Error(`Session server exited with ${code}`)))
    child.on('message', message => {
      if (message.serverInited || message.serverError) {
        resolve(message)
      }
    })
  })
}

describe('session server listening ports', () => {
  test('opens several sessions while the old fixed ports are occupied', { timeout: 20000 }, async () => {
    const blockers = []
    const dataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'electerm-session-ports-'))
    const originalEnv = { ...process.env }
    const originalExecArgv = [...process.execArgv]
    process.execArgv.push('--require', nodeCompat)
    try {
      for (const port of [30976, 30977, 30978]) {
        try {
          blockers.push(await listen(port))
        } catch (err) {
          if (err.code !== 'EADDRINUSE' && err.code !== 'EACCES') throw err
        }
      }
      process.env.NODE_ENV = 'development'
      process.env.DATA_PATH = dataPath
      process.env.ELECTERM_SLIM_DATA_PATH = dataPath
      process.env.electermHost = '127.0.0.1'
      // An inherited port must never override the child's fresh assignment.
      process.env.wsPort = '30976'
      const results = await Promise.all(Array.from({ length: 5 }, (_, index) => {
        return terminal({ type: 'ftp', uid: `port-test-${index}` }, null, `request-${index}`)
      }))
      assert.equal(new Set(results.map(result => result.port)).size, results.length)
      for (const { port } of results) {
        assert.ok(port > 0)
        assert.ok(![30976, 30977, 30978].includes(port))
        const socket = net.connect(port, '127.0.0.1')
        try {
          await once(socket, 'connect')
        } finally {
          socket.destroy()
        }
      }
    } finally {
      cleanupTerminals()
      for (const key of ['NODE_ENV', 'DATA_PATH', 'ELECTERM_SLIM_DATA_PATH', 'electermHost', 'wsPort']) {
        if (originalEnv[key] === undefined) delete process.env[key]
        else process.env[key] = originalEnv[key]
      }
      process.execArgv.splice(0, process.execArgv.length, ...originalExecArgv)
      await Promise.all(blockers.map(server => new Promise(resolve => server.close(resolve))))
      // Wait for the fork handles to close before removing their log directory.
      process.once('beforeExit', () => fs.rmSync(dataPath, { recursive: true, force: true }))
    }
  })

  test('reports a real bind failure over IPC instead of hanging', { timeout: 15000 }, async () => {
    const blocker = await listen()
    const dataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'electerm-session-bind-error-'))
    const child = fork(path.resolve(__dirname, '../../app/server/session-server.js'), {
      execArgv: ['--require', nodeCompat],
      env: {
        ...process.env,
        NODE_ENV: 'development',
        DATA_PATH: dataPath,
        ELECTERM_SLIM_DATA_PATH: dataPath,
        type: 'ftp',
        electermHost: '127.0.0.1',
        wsPort: String(blocker.address().port)
      },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc']
    })
    try {
      const message = await waitForStartup(child)
      assert.equal(message.serverError.code, 'EADDRINUSE')
      assert.match(message.serverError.message, /address already in use/)
      await once(child, 'exit')
    } finally {
      child.kill()
      await new Promise(resolve => blocker.close(resolve))
      fs.rmSync(dataPath, { recursive: true, force: true })
    }
  })
})
