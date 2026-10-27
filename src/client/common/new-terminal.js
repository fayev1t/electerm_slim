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

// Bookmark, history and MCP tabs spread this over their own data to get a
// fresh tab id, so it must not carry a connection type: a type here would
// open every ssh bookmark as a local terminal.
export default function newTerm (removeTitle) {
  const res = {
    id: uid(),
    status: 'processing',
    pane: paneMap.terminal,
    title: e('newTerminal')
  }
  if (removeTitle) {
    delete res.title
  }
  return res
}

// a blank tab the user opens is a local shell
export function newLocalTerm () {
  return {
    ...newTerm(),
    type: connectionMap.local
  }
}
