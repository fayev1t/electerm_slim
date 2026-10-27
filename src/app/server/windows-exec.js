/**
 * Windows local shell path.
 *
 * session-local spawns path.resolve(windir, execWindows). execWindows is
 * missing when a remote bookmark was opened as a local shell, and also when
 * the setting was cleared. path.resolve throws
 * 'The "paths[1]" argument must be of type string' for that undefined.
 * win32 so the result is the same on the Linux test runner.
 */

const { win32 } = require('path')

const defaultExec = 'System32/WindowsPowerShell/v1.0/powershell.exe'

function resolveWindowsExec (windir, execWindows) {
  const root = typeof windir === 'string' && windir
    ? windir
    : 'C:\\Windows'
  const rel = typeof execWindows === 'string' && execWindows
    ? execWindows
    : defaultExec
  return win32.resolve(root, rel)
}

module.exports = { resolveWindowsExec, defaultExec }
