const { _electron: electron, test, expect } = require('@playwright/test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const appOptions = require('./common/app-options')

test.setTimeout(60000)

async function launch (profile) {
  const app = await electron.launch({
    ...appOptions,
    args: [...appOptions.args, `--user-data-dir=${profile}`],
    env: {
      ...appOptions.env,
      DATA_PATH: path.join(profile, 'data'),
      XDG_CONFIG_HOME: path.join(profile, 'config')
    }
  })
  let page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  page = app.windows().at(-1) || page
  await page.setViewportSize({ width: 1200, height: 800 })
  await page.waitForFunction(() => window.store?.configLoaded)
  return { app, page }
}

test('starts and restarts on the home page without opening a session', async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'electerm-slim-home-'))
  let app
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const launched = await launch(profile)
      app = launched.app
      const { page } = launched
      expect(await page.evaluate(() => window.store.tabs.length)).toBe(0)
      await expect(page.locator('.no-session-logo')).toBeVisible()
      await expect(page.locator('.tabs .tab')).toHaveCount(0)
      await expect.poll(() => page.locator('.no-session-logo img').evaluate(img => img.naturalWidth)).toBeGreaterThan(0)
      const screenshotDir = process.env.ELECTERM_SLIM_SCREENSHOT_DIR
      if (screenshotDir && attempt === 0) {
        fs.mkdirSync(screenshotDir, { recursive: true })
        await page.screenshot({ path: path.join(screenshotDir, '启动首页.png') })
      }
      await app.close()
      app = null
    }
  } finally {
    if (app) await app.close()
    fs.rmSync(profile, { recursive: true, force: true })
  }
})

test('opens several local terminals immediately after startup', async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'electerm-slim-local-start-'))
  let app
  try {
    const launched = await launch(profile)
    app = launched.app
    const { page } = launched
    await page.evaluate(() => {
      for (let index = 0; index < 5; index++) {
        window.store.initFirstTab()
      }
    })
    await expect(page.locator('.tabs .tab')).toHaveCount(5)
    await expect.poll(() => page.evaluate(() => {
      return window.store.tabs.map(tab => ({ type: tab.type, status: tab.status }))
    }), { timeout: 20000 }).toEqual(Array.from({ length: 5 }, () => ({
      type: 'local',
      status: 'success'
    })))
    await expect(page.locator('.session-current .xterm-screen')).toBeVisible()
  } finally {
    if (app) await app.close()
    fs.rmSync(profile, { recursive: true, force: true })
  }
})
