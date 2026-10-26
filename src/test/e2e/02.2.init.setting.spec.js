const { _electron: electron, test, expect } = require('@playwright/test')
const appOptions = require('./common/app-options')
const e = require('./common/lang')

test.setTimeout(60000)

test('home page buttons and sidebar open the proper settings tab', async () => {
  const app = await electron.launch(appOptions)
  try {
    let page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    page = app.windows().at(-1) || page
    await page.setViewportSize({ width: 1200, height: 800 })
    await page.waitForFunction(() => window.store?.configLoaded)
    await expect(page.locator('.tabs .tab')).toHaveCount(0)

    const newBookmark = page.locator('.no-session-btns').getByRole('button', {
      name: e('newBookmark'),
      exact: true
    })
    const activeTab = page.locator('.setting-wrap .ant-tabs-nav-list .ant-tabs-tab-active').first()
    const close = page.locator('.setting-wrap .close-setting-wrap-icon')

    await newBookmark.click()
    await expect(activeTab).toHaveText(e('bookmarks'))
    await close.click()
    await expect(page.locator('.setting-wrap')).toBeHidden()

    await page.locator('.control-icon-wrap .anticon-setting').click()
    await expect(activeTab).toHaveText(e('setting'))
    await close.click()
    await expect(page.locator('.setting-wrap')).toBeHidden()

    await newBookmark.click()
    await expect(activeTab).toHaveText(e('bookmarks'))
  } finally {
    await app.close()
  }
})
