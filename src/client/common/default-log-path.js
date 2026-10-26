import { osResolve } from './resolve'

export default function () {
  return window.et.sessionLogPath || osResolve(window.store.dataPath || window.pre.dataPath || osResolve(window.store.appPath, 'electerm_slim'), 'session_logs')
}
