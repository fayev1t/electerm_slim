// Session servers normally run under Electron. In these plain Node tests,
// there is no asar archive, so Electron's original-fs is the normal fs module.
const { registerHooks } = require('node:module')

registerHooks({
  resolve (specifier, context, nextResolve) {
    return nextResolve(specifier === 'original-fs' ? 'node:fs' : specifier, context)
  }
})
