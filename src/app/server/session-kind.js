/**
 * Which session module a create-terminal request should load.
 *
 * A local shell has no host. Builds that wrote type "local" onto ssh
 * bookmarks still send that type; on Windows the local module then calls
 * path.resolve(windir, undefined) and the connection dies with
 * 'The "paths[1]" argument must be of type string'. A host means this is
 * not a local shell, so it is opened as ssh. Mutates initOptions so the
 * child process sees the same type the parent used.
 */

const localShellTypes = [
  'telnet',
  'serial',
  'local',
  'rdp',
  'vnc',
  'spice'
]

const notSshTypes = [...localShellTypes, 'ftp']

function normalizeSessionType (initOptions = {}) {
  const declared = initOptions.termType || initOptions.type || 'ssh'
  if (declared === 'local' && initOptions.host) {
    initOptions.termType = 'ssh'
    if (!initOptions.type || initOptions.type === 'local') {
      initOptions.type = 'ssh'
    }
  }
  const type = initOptions.termType || initOptions.type || 'ssh'
  return {
    type,
    moduleName: localShellTypes.includes(type) ? type : 'ssh',
    isSsh: !notSshTypes.includes(type)
  }
}

module.exports = { normalizeSessionType }
