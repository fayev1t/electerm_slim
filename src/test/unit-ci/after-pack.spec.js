const { describe, test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { Arch } = require('electron-builder')
const afterPack = require('../../build/bin/after-pack')

const releaseConpty = 'resources/app.asar.unpacked/node_modules/node-pty/build/Release/conpty'

let tmp

function fakePty (archs = ['x64', 'arm64']) {
  const ptyDir = path.join(tmp, 'node-pty')
  for (const arch of archs) {
    const dir = path.join(ptyDir, 'third_party/conpty/1.0.0', `win10-${arch}`)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'conpty.dll'), `dll ${arch}`)
    fs.writeFileSync(path.join(dir, 'OpenConsole.exe'), `exe ${arch}`)
  }
  return ptyDir
}

describe('after-pack conpty copy', () => {
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'electerm-after-pack-'))
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  test('copies conpty.dll and OpenConsole.exe for the packed architecture', () => {
    const ptyDir = fakePty()
    for (const arch of ['x64', 'arm64']) {
      const appOutDir = path.join(tmp, `win-${arch}-unpacked`)
      assert.equal(afterPack.copyConpty({ ptyDir, appOutDir, arch }), true)
      const to = path.join(appOutDir, releaseConpty)
      assert.equal(fs.readFileSync(path.join(to, 'conpty.dll'), 'utf8'), `dll ${arch}`)
      assert.equal(fs.readFileSync(path.join(to, 'OpenConsole.exe'), 'utf8'), `exe ${arch}`)
    }
  })

  test('skips a node-pty without a bundled conpty and an unsupported architecture', () => {
    const appOutDir = path.join(tmp, 'win-unpacked')
    const oldPty = path.join(tmp, 'old-node-pty')
    fs.mkdirSync(oldPty)
    assert.equal(afterPack.copyConpty({ ptyDir: oldPty, appOutDir, arch: 'x64' }), false)
    assert.equal(afterPack.copyConpty({ ptyDir: fakePty(), appOutDir, arch: 'ia32' }), false)
    assert.equal(fs.existsSync(appOutDir), false)
  })

  test('fails the build when the dll for the architecture is missing', () => {
    const ptyDir = fakePty(['arm64'])
    assert.throws(
      () => afterPack.copyConpty({ ptyDir, appOutDir: path.join(tmp, 'win-unpacked'), arch: 'x64' }),
      { code: 'ENOENT' }
    )
  })

  test('the hook copies the repository node-pty dll into a windows x64 pack only', async () => {
    const appOutDir = path.join(tmp, 'win-unpacked')
    await afterPack.default({ electronPlatformName: 'linux', arch: Arch.x64, appOutDir })
    assert.equal(fs.existsSync(appOutDir), false)

    await afterPack.default({ electronPlatformName: 'win32', arch: Arch.x64, appOutDir })
    const ptyDir = path.dirname(require.resolve('node-pty/package.json'))
    const conptyDir = path.join(ptyDir, 'third_party/conpty')
    const source = path.join(conptyDir, fs.readdirSync(conptyDir)[0], 'win10-x64/conpty.dll')
    const copied = path.join(appOutDir, releaseConpty, 'conpty.dll')
    assert.ok(fs.readFileSync(copied).equals(fs.readFileSync(source)))
  })
})
