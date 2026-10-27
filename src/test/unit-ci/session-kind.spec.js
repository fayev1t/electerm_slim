const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { normalizeSessionType } = require('../../app/server/session-kind')
const { resolveWindowsExec } = require('../../app/server/windows-exec')
const { win32 } = require('node:path')

describe('session kind', () => {
  test('a host marked local is opened as ssh', () => {
    const options = { termType: 'local', type: 'remote', host: '10.0.0.8', port: 22 }
    const kind = normalizeSessionType(options)
    assert.equal(kind.type, 'ssh')
    assert.equal(kind.moduleName, 'ssh')
    assert.equal(kind.isSsh, true)
    assert.equal(options.termType, 'ssh')
    assert.equal(options.type, 'remote')
  })

  test('a local shell with no host stays local', () => {
    const options = { termType: 'local', type: 'local' }
    const kind = normalizeSessionType(options)
    assert.equal(kind.moduleName, 'local')
    assert.equal(kind.isSsh, false)
    assert.equal(options.termType, 'local')
  })

  test('telnet, rdp and an unmarked host stay on their own kinds', () => {
    assert.equal(normalizeSessionType({ termType: 'telnet', host: '10.0.0.8' }).moduleName, 'telnet')
    assert.equal(normalizeSessionType({ termType: 'rdp', host: '10.0.0.8' }).moduleName, 'rdp')
    assert.equal(normalizeSessionType({ type: 'remote', host: '10.0.0.8' }).moduleName, 'ssh')
    assert.equal(normalizeSessionType({ type: 'ftp', host: '10.0.0.8' }).isSsh, false)
  })
})

describe('windows exec path', () => {
  test('a missing exec does not get passed to path.resolve', () => {
    const root = 'C:\\Windows'
    const expected = win32.resolve(root, 'System32/WindowsPowerShell/v1.0/powershell.exe')
    assert.equal(resolveWindowsExec(root, undefined), expected)
    assert.equal(resolveWindowsExec(undefined, undefined), expected)
    assert.equal(resolveWindowsExec(root, ''), expected)
  })

  test('an absolute exec is kept', () => {
    const abs = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe'
    assert.equal(resolveWindowsExec('C:\\Windows', abs), abs)
  })
})
