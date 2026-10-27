/**
 * terminal/sftp/serial class
 */

const { normalizeSessionType } = require('./session-kind')

/**
 * Dynamically load a module based on terminal type
 * @param {string} type - Terminal type
 * @returns {Object} The loaded module
 */
function loadModule (type) {
  return require(`./session-${type}`)
}

/**
 * Create a terminal session
 * @param {object} initOptions - Terminal initialization options
 * @param {object} ws - WebSocket connection
 * @returns {Promise} Terminal session
 */
exports.startSession = async function (initOptions, ws, func = 'session') {
  const { moduleName } = normalizeSessionType(initOptions)
  const module = loadModule(moduleName)
  return module[func](initOptions, ws)
}
