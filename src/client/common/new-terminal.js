/**
 * output default new terminal data obj
 */

import uid from './id-with-stamp'
import {
  paneMap,
  connectionMap
} from './constants'

const e = window.translate
window.et.tabCount = 0

export function updateCount (tab) {
  window.et.tabCount++
  return window.et.tabCount
}

export default (removeTitle) => {
  const res = {
    id: uid(),
    type: connectionMap.local,
    status: 'processing',
    pane: paneMap.terminal,
    title: e('newTerminal')
  }
  if (removeTitle) {
    delete res.title
  }
  return res
}
