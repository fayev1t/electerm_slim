const { _electron: electron, test, expect } = require('@playwright/test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const appOptions = require('./common/app-options')

test.setTimeout(60000)

test('application, about links and logos use electerm_slim', async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'electerm-slim-branding-'))
  const app = await electron.launch({
    ...appOptions,
    args: [...appOptions.args, `--user-data-dir=${profile}`],
    env: {
      ...appOptions.env,
      DATA_PATH: path.join(profile, 'data'),
      XDG_CONFIG_HOME: path.join(profile, 'config')
    }
  })
  try {
    let page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    page = app.windows().at(-1) || page
    await page.waitForFunction(() => window.store?.configLoaded)
    await page.setViewportSize({ width: 1200, height: 800 })
    await expect(page).toHaveTitle('electerm_slim')
    expect(await app.evaluate(({ app }) => app.getName())).toBe('electerm_slim')
    await expect(page.locator('img.menu-logo')).toBeVisible()
    await expect.poll(() => page.locator('img.menu-logo').evaluate(img => img.naturalWidth)).toBeGreaterThan(0)

    await page.evaluate(() => {
      window.store.openAbout()
    })
    const about = page.locator('.info-modal')
    await expect(about.locator('.logo-name')).toHaveText('electerm_slim')
    await expect(about.locator('a[href="https://github.com/fayev1t/electerm_slim/releases"]')).toBeVisible()
    await expect(about.locator('a[href="https://github.com/fayev1t/electerm_slim/issues"]').first()).toBeVisible()
    await expect(about.locator('a[href*="electerm.org"]')).toHaveCount(0)
    await expect(about).not.toContainText('ZHAO Xudong')
    await expect(about).not.toContainText('HarmonyOS')
    await expect.poll(() => about.locator('.logo-img').evaluate(img => img.naturalWidth)).toBeGreaterThan(0)

    const screenshotDir = process.env.ELECTERM_SLIM_SCREENSHOT_DIR
    if (screenshotDir) {
      fs.mkdirSync(screenshotDir, { recursive: true })
      await page.screenshot({ path: path.join(screenshotDir, 'electerm_slim-关于.png') })
    }

    await page.evaluate(() => {
      window.store.showInfoModal = false
      window.store.removeTabs(() => true)
    })
    await page.setViewportSize({ width: 375, height: 800 })
    const logo = page.locator('.no-session-logo .logo-elem')
    await expect(logo).toBeVisible()
    await expect(logo.locator('.logo-name')).toHaveText('electerm_slim')
    const bounds = await logo.boundingBox()
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(375)
    await expect.poll(() => logo.locator('img').evaluate(img => img.naturalWidth)).toBeGreaterThan(0)
    if (screenshotDir) {
      await page.screenshot({ path: path.join(screenshotDir, 'electerm_slim-首页.png') })
    }
  } finally {
    await app.close()
    fs.rmSync(profile, { recursive: true, force: true })
  }
})
