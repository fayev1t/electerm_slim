/**
 * repair remote connections saved with the local type
 */

import { isEqual } from 'lodash-es'
import { connectionMap } from './constants'

// Builds whose newTerm() carried type: 'local' (98cedfcc to b756e8fe) spread
// it over every bookmark and history tab they opened. History kept those
// tabs, and "create bookmark from history" copies the type, so ssh and other
// remote connections still open as local shells, which on Windows fails with
// 'The "paths[1]" argument must be of type string'. A local shell has no host.
function isWrongLocal (item) {
  return !!item && item.type === connectionMap.local && !!item.host
}

/**
 * Give one broken tab or bookmark the type of a bookmark with the same
 * address, or ssh. Fixed in place. Opening a tab and testing a connection
 * run this after applyProfileToTabs, which can put the local type back after
 * the stored data was repaired at startup.
 * @param {object} item
 * @param {array} bookmarks
 * @return {boolean} whether the type was changed
 */
export function fixLocalTab (item, bookmarks = []) {
  if (!isWrongLocal(item)) {
    return false
  }
  const src = bookmarks.find(b =>
    !isWrongLocal(b) &&
    b.host === item.host &&
    b.port === item.port &&
    b.username === item.username
  )
  item.type = (src && src.type) || connectionMap.ssh
  return true
}

/**
 * Give each broken bookmark and history tab the type of a bookmark with the
 * same address, or ssh, and merge history entries that become duplicates.
 * Bookmarks are fixed in place.
 * @param {array} bookmarks
 * @param {array} history
 * @return {array} history
 */
export default function fixLocalType (bookmarks = [], history = []) {
  const sources = bookmarks.filter(b => !isWrongLocal(b))
  bookmarks.filter(isWrongLocal).forEach(b => fixLocalTab(b, sources))
  const fixed = new Set(history.filter(h => isWrongLocal(h.tab)))
  if (!fixed.size) {
    return history
  }
  fixed.forEach(h => fixLocalTab(h.tab, sources))
  // a fixed entry can now equal one saved before the bug: keep the newer
  // position and add up the counts
  const res = []
  for (const h of history) {
    const twin = res.find(r =>
      (fixed.has(r) || fixed.has(h)) && isEqual(r.tab, h.tab)
    )
    if (!twin) {
      res.push(h)
      continue
    }
    twin.count = (twin.count || 0) + (h.count || 0)
    twin.time = Math.max(twin.time || 0, h.time || 0)
  }
  return res
}
