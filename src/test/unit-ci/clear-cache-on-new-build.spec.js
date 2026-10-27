const { describe, test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { clearCacheOnNewBuild } = require('../../app/lib/clear-cache-on-new-build')

let tmp
let marker
let session

describe('clear-cache-on-new-build', () => {
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'electerm-ui-build-'))
    marker = path.join(tmp, 'ui-build')
    session = {
      cleared: 0,
      async clearCache () {
        this.cleared++
      }
    }
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  test('clears once per build, including the first start', async () => {
    assert.equal(await clearCacheOnNewBuild(session, 111, marker), true)
    assert.equal(fs.readFileSync(marker, 'utf8'), '111')
    assert.equal(await clearCacheOnNewBuild(session, 111, marker), false)
    assert.equal(session.cleared, 1)

    // a new build of the same version
    assert.equal(await clearCacheOnNewBuild(session, 222, marker), true)
    assert.equal(fs.readFileSync(marker, 'utf8'), '222')
    assert.equal(session.cleared, 2)
  })

  test('does nothing without a build time, as in dev', async () => {
    assert.equal(await clearCacheOnNewBuild(session, undefined, marker), false)
    assert.equal(session.cleared, 0)
    assert.equal(fs.existsSync(marker), false)
  })

  test('keeps the marker when clearing fails, so the next start tries again', async () => {
    session.clearCache = async () => { throw new Error('busy') }
    await assert.rejects(clearCacheOnNewBuild(session, 333, marker), /busy/)
    assert.equal(fs.existsSync(marker), false)
  })
})
