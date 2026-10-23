const { _electron: electron, test, expect } = require('@playwright/test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const appOptions = require('./common/app-options')

test.setTimeout(60000)

test('terminal tools and their panels stay at the top', async () => {
  const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'electerm-top-toolbar-'))
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
    await page.waitForLoadState('domcontentloaded')
    page = app.windows().at(-1) || page
    await page.waitForFunction(() => window.store?.configLoaded && window.store.currentTab?.status === 'success')
    await page.setViewportSize({ width: 1200, height: 800 })
    await page.evaluate(() => {
      Object.assign(window.store, {
        pinned: false,
        openedSideBar: '',
        rightPanelVisible: false,
        rightPanelPinned: false,
        pinnedQuickCommandBar: false,
        quickCommandsInRightPanel: false,
        cmdHistoryInRightPanel: false
      })
    })

    const toolbar = page.locator('.session-current .terminal-control')
    const terminal = page.locator('.session-current .term-wrap')
    const tools = toolbar.locator('.terminal-tools')
    await expect(tools).toBeVisible()
    await expect(page.locator('.main-footer')).toHaveCount(0)
    async function expectTerminalBottom () {
      await expect.poll(async () => {
        const bounds = await terminal.boundingBox()
        return Math.abs(bounds.y + bounds.height - 800)
      }).toBeLessThanOrEqual(1)
    }
    await expectTerminalBottom()

    async function expectBelowToolbar (locator) {
      await expect(locator).toBeVisible()
      const bounds = await locator.boundingBox()
      const bar = await toolbar.boundingBox()
      expect(bounds.y).toBeGreaterThanOrEqual(bar.y + bar.height - 1)
      expect(bounds.x).toBeGreaterThanOrEqual(0)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize().width)
    }

    const history = tools.locator('.cmd-history-trigger')
    await history.click()
    await expectBelowToolbar(page.locator('.ant-popover:visible').filter({ has: page.locator('.cmd-history-popover-content') }))
    await history.click()

    await tools.locator('.batch-input-holder').click()
    await expectBelowToolbar(page.locator('.ant-popover:visible').filter({ has: page.locator('.batch-input-panel') }))
    await page.locator('.batch-input-panel textarea').fill('echo top-toolbar')
    await page.locator('.batch-input-panel textarea').press('Enter')
    await expect(page.locator('.batch-input-panel:visible')).toHaveCount(0)

    await tools.locator('.quick-command-trigger').click()
    const quickCommands = page.locator('.session-current .qm-wrap-tooltip')
    await expectBelowToolbar(quickCommands)
    await quickCommands.locator('.anticon-pushpin').click()
    await expect.poll(async () => (await terminal.boundingBox()).y).toBe(248)
    await expectTerminalBottom()
    await quickCommands.getByRole('button', { name: 'close-circle', exact: true }).click()

    await toolbar.locator('.anticon-search').click()
    await expectBelowToolbar(page.locator('.session-current .term-search-wrap'))
    await page.locator('.term-search-wrap .anticon-close-circle').click()

    await tools.locator('.terminal-trigger-icon').click()
    await expectBelowToolbar(page.locator('.ant-modal:visible'))
    await page.locator('.ant-modal-close').click()

    await tools.getByRole('combobox').click()
    await expectBelowToolbar(page.locator('.ant-select-dropdown:visible'))
    await page.keyboard.press('Escape')

    await tools.locator('.terminal-info-icon').click()
    const rightPanel = page.locator('.right-side-panel')
    await expectBelowToolbar(rightPanel)
    await rightPanel.locator('.right-side-panel-pin').click()
    await expect.poll(async () => (await rightPanel.boundingBox()).y).toBe(0)
    await rightPanel.locator('.right-side-panel-pin').click()
    await expectBelowToolbar(rightPanel)
    await rightPanel.locator('.right-side-panel-close').click()

    await page.evaluate(() => window.store.setConfig({
      baseURLAI: 'http://127.0.0.1:1',
      apiPathAI: '/chat/completions',
      modelAI: 'toolbar-test',
      roleAI: 'Shell assistant',
      languageAI: 'en_us',
      authHeaderNameAI: 'Authorization: Bearer'
    }))
    await tools.locator('.ai-icon').click()
    await expectBelowToolbar(rightPanel)
    await expect(tools.locator('.ai-icon')).toHaveClass(/active/)
    await tools.locator('.ai-icon').click()
    await expect(rightPanel).toHaveCount(0)

    await page.evaluate(() => {
      const { store } = window
      store.updateTab(store.activeTabId, { type: 'ssh', host: 'monitor.invalid', status: 'error' })
      store.setConfig({ remoteMonitorBarEnabled: true })
    })
    const monitor = page.locator('.session-current .remote-monitor-bar')
    await expectBelowToolbar(monitor)
    await expect.poll(async () => (await terminal.boundingBox()).y).toBe(96)

    await page.evaluate(() => window.store.toggleSessFullscreen(true))
    await expect.poll(async () => (await toolbar.boundingBox()).y).toBe(0)
    await expectBelowToolbar(monitor)
    await expect.poll(async () => (await terminal.boundingBox()).y).toBe(60)
    await expectTerminalBottom()
    await page.screenshot({ path: test.info().outputPath('top-toolbar-fullscreen.png') })
    await page.evaluate(() => window.store.toggleSessFullscreen(false))

    await page.setViewportSize({ width: 375, height: 800 })
    await page.waitForFunction(() => window.store.isMobile)
    await history.click()
    await expectBelowToolbar(page.locator('.ant-popover:visible').filter({ has: page.locator('.cmd-history-popover-content') }))
    await page.screenshot({ path: test.info().outputPath('top-toolbar-mobile.png') })
    await history.click()

    await page.setViewportSize({ width: 1200, height: 800 })
    await page.waitForFunction(() => !window.store.isMobile)
    await page.evaluate(() => { window.store.layout = 'r2' })
    await page.evaluate(() => {
      const { store } = window
      store.addTab(undefined, undefined, 1)
      store.pinnedQuickCommandBar = true
    })
    await page.waitForFunction(() => window.store.currentTab?.status === 'success')
    await expect(page.locator('.terminal-tools')).toHaveCount(1)
    await expect.poll(async () => (await toolbar.boundingBox()).y).toBeGreaterThanOrEqual(400)
    await expectBelowToolbar(quickCommands)
    await tools.locator('.terminal-info-icon').click()
    await expectBelowToolbar(rightPanel)
    await rightPanel.locator('.right-side-panel-close').click()
    await page.evaluate(() => { window.store.activeTabId = window.store.activeTabId0 })
    await expect.poll(async () => (await toolbar.boundingBox()).y).toBeLessThan(400)
    await expectBelowToolbar(quickCommands)
  } finally {
    await app.close()
    fs.rmSync(profileRoot, { recursive: true, force: true })
  }
})
