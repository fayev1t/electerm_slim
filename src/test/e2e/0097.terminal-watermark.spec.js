const { _electron: electron, test, expect } = require('@playwright/test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const appOptions = require('./common/app-options')

test.setTimeout(60000)

// The default terminal bg is the electerm_slim wordmark, an opaque white
// image. At full strength it covered the terminal text, so css-overwrite
// fades it, and that fade must not leak onto a tab's own background image.
test('default terminal watermark stays faint behind the text', async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'electerm-slim-watermark-'))
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
    await page.setViewportSize({ width: 1200, height: 800 })
    await page.waitForFunction(() => window.store?.configLoaded)
    await page.evaluate(() => {
      window.store.initFirstTab()
    })
    const screen = page.locator('.session-batch-active .xterm-screen')
    await expect(screen).toBeVisible()
    const watermark = () => screen.evaluate(el => {
      const style = window.getComputedStyle(el, '::before')
      return { image: style.backgroundImage, opacity: Number(style.opacity) }
    })

    await expect.poll(async () => (await watermark()).image)
      .toContain('electerm_slim-wordmark.png')
    const { opacity } = await watermark()
    expect(opacity).toBeGreaterThan(0)
    expect(opacity).toBeLessThanOrEqual(0.1)

    await page.evaluate(() => {
      const { store } = window
      store.updateTab(store.activeTabId, {
        terminalBackground: { terminalBackgroundImagePath: 'randomShape' }
      })
    })
    await expect.poll(async () => (await watermark()).image)
      .toContain('data:image/png')
    expect((await watermark()).opacity).toBe(1)
  } finally {
    await app.close()
    fs.rmSync(profile, { recursive: true, force: true })
  }
})
