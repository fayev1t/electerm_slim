/**
 * electron-builder afterPack hook: put node-pty's conpty.dll back into the app
 *
 * Local terminals on Windows start through the conpty.dll that ships with
 * node-pty (`useConptyDll` in src/app/server/session-local.js). node-pty's own
 * install script copies it from third_party/ into build/Release/conpty, but
 * electron-builder rebuilds node-pty from source while packaging, which wipes
 * build/, and `yarn autoclean` has already dropped third_party/ from work/app.
 * Copy it from the node-pty in the repository instead, after the rebuild.
 */
const fs = require('fs')
const path = require('path')

// the architectures node-pty ships a conpty.dll for
const conptyArchs = ['x64', 'arm64']

function copyConpty ({ ptyDir, appOutDir, arch }) {
  const conptyDir = path.join(ptyDir, 'third_party', 'conpty')
  // node-pty before 1.2 has no bundled conpty and uses the system one
  if (!fs.existsSync(conptyDir) || !conptyArchs.includes(arch)) {
    return false
  }
  // same lookup as node-pty's scripts/post-install.js
  const version = fs.readdirSync(conptyDir)[0]
  const from = path.join(conptyDir, version, `win10-${arch}`)
  const to = path.join(
    appOutDir,
    'resources/app.asar.unpacked/node_modules/node-pty/build/Release/conpty'
  )
  fs.mkdirSync(to, { recursive: true })
  for (const file of ['conpty.dll', 'OpenConsole.exe']) {
    fs.copyFileSync(path.join(from, file), path.join(to, file))
  }
  return true
}

exports.copyConpty = copyConpty

exports.default = async function afterPack (context) {
  if (context.electronPlatformName !== 'win32') {
    return
  }
  const { Arch } = require('electron-builder')
  const arch = Arch[context.arch]
  const ptyDir = path.dirname(require.resolve('node-pty/package.json'))
  if (copyConpty({ ptyDir, appOutDir: context.appOutDir, arch })) {
    console.log(`  • copied node-pty conpty.dll  arch=${arch}`)
  }
}
