/**
 * Side panel chrome follows isMobile on both sides:
 *
 * - the pin control is desktop-only (on mobile a panel spans the viewport, so
 *   there is nothing to dock beside and no room for the extra control), and a
 *   pin persisted from a desktop session must not survive into that mode — it
 *   is not reachable (no control) and would otherwise leave a mode the user
 *   cannot leave;
 * - the panels are full-screen drawers on mobile: full viewport width, no
 *   resize handle, and no way to change the width — the desktop width stays in
 *   localStorage untouched.
 */

const { _electron: electron, test } = require('@playwright/test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const appOptions = require('./common/app-options')

test.setTimeout(60000)

test('panel pin and drawer behaviour follow isMobile', async () => {
  const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'electerm-panel-pin-'))
  const app = await electron.launch({
    ...appOptions,
    args: [...appOptions.args, `--user-data-dir=${profileRoot}`],
    env: {
      ...appOptions.env,
      DATA_PATH: path.join(profileRoot, 'data'),
      XDG_CONFIG_HOME: path.join(profileRoot, 'config')
    }
  })
  try {
    let page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded').catch(() => {})
    const windows = app.windows()
    page = windows[windows.length - 1] || page
    await page.waitForFunction(() => window.store?.configLoaded === true, null, {
      timeout: 30000
    })

    const openPanels = () => page.evaluate(() => {
      Object.assign(window.store, {
        _leftSideBarOpen: true,
        openedSideBar: 'bookmarks',
        rightPanelTab: 'info',
        rightPanelVisible: true
      })
    })

    const probe = () => page.evaluate(() => ({
      isMobile: window.store.isMobile,
      rootClasses: document.querySelector('.is-mobile, .is-desktop').className,
      leftPin: document.querySelectorAll('.sidebar-pin-top .anticon-pushpin').length,
      rightPin: document.querySelectorAll('.right-side-panel .anticon-pushpin').length
    }))

    // panel extent + whether the resize handle is rendered at all
    const drawer = () => page.evaluate(() => {
      const rect = sel => {
        const el = document.querySelector(sel)
        if (!el) {
          return null
        }
        const r = el.getBoundingClientRect()
        return {
          left: Math.round(r.left),
          top: Math.round(r.top),
          width: Math.round(r.width),
          height: Math.round(r.height)
        }
      }
      return {
        viewport: window.innerWidth,
        left: rect('.sidebar-list'),
        right: rect('.right-side-panel'),
        leftHandle: document.querySelectorAll('.sidebar-list .drag-handle').length,
        rightHandle: document.querySelectorAll('.right-side-panel .drag-handle').length
      }
    })

    // What actually paints at the bottom of the screen. Geometry alone does not
    // prove this: .sidebar is its own stacking context, so a drawer that spans
    // to the bottom edge can still be painted over by session content.
    const drawerCoverage = () => page.evaluate(() => {
      const el = document.elementFromPoint(180, window.innerHeight - 20)
      const inDrawer = sel => !!(el && el.closest && el.closest(sel))
      return {
        left: inDrawer('.sidebar-list'),
        right: inDrawer('.right-side-panel')
      }
    })

    const geometry = () => page.evaluate(() => ({
      toolbarLeft: document.querySelector('.session-current .terminal-control').getBoundingClientRect().left,
      panelBottom: document.querySelector('.right-side-panel').getBoundingClientRect().bottom
    }))

    // --- desktop: both pins present, panels behave as overlay then dock
    await page.setViewportSize({ width: 1200, height: 800 })
    await page.waitForFunction(() => window.store.width === 1200)
    await openPanels()
    await page.waitForSelector('.sidebar-pin-top')
    const desktop = await probe()
    assert.equal(desktop.isMobile, false)
    assert.equal(desktop.leftPin, 1)
    assert.equal(desktop.rightPin, 1)
    assert.ok(desktop.rootClasses.includes('is-desktop'))
    // desktop keeps both resize handles and the stored widths: the left panel
    // starts at the 43px icon bar and is 300px wide, the right one is 500px and
    // starts below the top toolbar
    assert.deepEqual(await drawer(), {
      viewport: 1200,
      left: { left: 43, top: 0, width: 300, height: 800 },
      right: { left: 700, top: 68, width: 500, height: 732 },
      leftHandle: 1,
      rightHandle: 1
    })
    // Unpinned drawers overlay the session; the top toolbar keeps its position.
    assert.deepEqual(await geometry(), { toolbarLeft: 43, panelBottom: 800 })

    await page.evaluate(() => {
      window.store.setRightPanelPinned(true)
      window.store.pinned = true
    })
    await page.waitForFunction(() => document.querySelector('.right-side-panel-pinned') !== null)
    await page.waitForFunction(() => document.querySelector('.is-desktop').classList.contains('pinned'))
    // pinned: the right panel becomes a full-height dock
    assert.equal((await geometry()).panelBottom, 800)

    // --- mobile: no pin in either panel, and the dock mode is inert
    await page.setViewportSize({ width: 375, height: 800 })
    await page.waitForFunction(() => window.store.width === 375)
    await page.waitForFunction(() => document.querySelector('.sidebar-pin-top .anticon-pushpin') === null)
    const mobile = await probe()
    assert.equal(mobile.isMobile, true)
    assert.equal(mobile.leftPin, 0)
    assert.equal(mobile.rightPin, 0)
    assert.ok(!mobile.rootClasses.includes('pinned'))
    // both panels are full-screen drawers: they span the viewport from 0 to the
    // right edge — the left one covers the 43px icon bar too — run all the way
    // to the bottom edge and render no resize handle
    assert.deepEqual(await drawer(), {
      viewport: 375,
      left: { left: 0, top: 0, width: 375, height: 800 },
      right: { left: 0, top: 68, width: 375, height: 732 },
      leftHandle: 0,
      rightHandle: 0
    })
    // ... and they really paint over session content, which is what the extra
    // z-index is for. Probed one drawer at a time: they overlap when both are
    // open, and the right one wins there.
    assert.deepEqual(await drawerCoverage(), { left: false, right: true })
    await page.evaluate(() => { window.store.rightPanelVisible = false })
    await page.waitForFunction(() => document.querySelector('.right-side-panel') === null)
    assert.deepEqual(await drawerCoverage(), { left: true, right: false })
    await page.evaluate(() => {
      window.store.openedSideBar = ''
      window.store.rightPanelVisible = true
    })
    await page.waitForFunction(() => document.querySelector('.sidebar-list').getBoundingClientRect().width === 0)
    assert.deepEqual(await drawerCoverage(), { left: false, right: true })
    await page.evaluate(() => { window.store.setOpenedSideBar('bookmarks') })
    await page.waitForFunction(() => document.querySelector('.sidebar-list').getBoundingClientRect().width === 375)
    // a resize attempt is ignored: the panel keeps the viewport width and the
    // stored desktop values are left alone
    const resize = await page.evaluate(() => {
      window.store.setLeftSidePanelWidth(123)
      window.store.setRightSidePanelWidth(456)
      return {
        left: window.store.leftSidePanelWidth,
        right: window.store.rightPanelWidth,
        storedLeft: window.store._leftSidePanelWidth,
        storedRight: window.store._rightPanelWidth
      }
    })
    assert.deepEqual(resize, {
      left: 375,
      right: 375,
      storedLeft: 300,
      storedRight: 500
    })
    // a drawer is a full-height surface on mobile: unlike the desktop overlay it
    // reaches the bottom edge
    assert.equal((await geometry()).panelBottom, 800)

    // the stale pin must not dead-lock the bookmark toggle or the click-outside
    // dismissal (both used to bail out on `pinned` alone)
    const stalePin = await page.evaluate(() => {
      const out = { pinned: window.store.pinned }
      window.store.setOpenedSideBar('')
      window.store.openLeftSidePanel('bookmarks')
      out.afterOpen = window.store.openedSideBar
      // the panel is a toggle: the second call closes it again instead of
      // returning early because of the stale pin
      window.store.openLeftSidePanel('history')
      out.afterSecondCall = window.store.openedSideBar
      window.store.openLeftSidePanel('history')
      out.afterThirdCall = window.store.openedSideBar
      out.toolbarLeft = document.querySelector('.session-current .terminal-control').getBoundingClientRect().left
      out.pins = document.querySelectorAll('.anticon-pushpin').length
      return out
    })
    assert.equal(stalePin.pinned, true)
    assert.equal(stalePin.afterOpen, 'bookmarks')
    assert.equal(stalePin.afterSecondCall, '')
    assert.equal(stalePin.afterThirdCall, 'history')
    // Mobile ignores the persisted pin and reserves only the icon bar.
    assert.equal(stalePin.toolbarLeft, 43)
    assert.equal(stalePin.pins, 0)

    // --- back to desktop: the pin controls return, the widths survived the
    // mobile session, and the persisted pin re-applies — the right panel is a
    // full-height dock again (top 0 / bottom 0) rather than an overlay
    await page.setViewportSize({ width: 1200, height: 800 })
    await page.waitForFunction(() => window.store.isMobile === false)
    await page.waitForFunction(() => document.querySelector('.sidebar-pin-top .anticon-pushpin') !== null)
    const back = await probe()
    assert.equal(back.leftPin, 1)
    assert.equal(back.rightPin, 1)
    assert.ok(back.rootClasses.includes('pinned'))
    assert.deepEqual(await drawer(), {
      viewport: 1200,
      left: { left: 43, top: 0, width: 300, height: 800 },
      right: { left: 700, top: 0, width: 500, height: 800 },
      leftHandle: 1,
      rightHandle: 1
    })
  } finally {
    await app.close().catch(() => {})
    fs.rmSync(profileRoot, { recursive: true, force: true })
  }
})
