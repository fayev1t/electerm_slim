const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { PassThrough } = require('node:stream')
const { selectRelease, findReleaseAsset } = require('../../app/common/release-info.mjs')
const packInfo = require('../../../package.json')

const installSrc = 'win-x64-installer.exe'
const downloadUrl = `${packInfo.releases}/download/v0.2.0/${packInfo.name}-0.2.0-${installSrc}`

function release (overrides = {}) {
  return {
    tag_name: 'v0.2.0',
    published_at: '2026-10-25T12:00:00Z',
    draft: false,
    prerelease: false,
    body: '',
    assets: [{
      name: `${packInfo.name}-0.2.0-${installSrc}`,
      browser_download_url: downloadUrl,
      size: 4
    }],
    ...overrides
  }
}

describe('release selection', () => {
  test('prefers stable releases and ignores drafts', () => {
    const stable = release()
    assert.equal(selectRelease([
      release({ tag_name: 'v1.0.0', draft: true }),
      release({ tag_name: 'v0.3.0', prerelease: true }),
      stable
    ]), stable)
  })

  test('supports a repository with preview releases only', () => {
    const preview = release({ prerelease: true })
    assert.equal(selectRelease([
      release({ tag_name: 'v0.1.0', prerelease: true, published_at: '2026-10-22T12:00:00Z' }),
      preview
    ]), preview)
  })

  test('handles an empty repository and API error responses', () => {
    for (const data of [[], null, undefined, { message: 'Not Found' }]) {
      assert.equal(selectRelease(data), undefined)
    }
  })

  test('accepts a single GitHub release response', () => {
    const info = release()
    assert.equal(selectRelease(info), info)
  })

  test('matches both the product and the installation target', () => {
    const info = release()
    info.assets.unshift(
      { name: 'other-product-0.2.0-' + installSrc },
      { name: `${packInfo.name}-0.2.0-win-arm64-installer.exe` },
      { name: `${packInfo.name}-0.2.0-${installSrc}.blockmap` }
    )
    assert.equal(findReleaseAsset(info, installSrc, packInfo.name).browser_download_url, downloadUrl)
    assert.equal(findReleaseAsset(info, '', packInfo.name), undefined)
    assert.equal(findReleaseAsset(info, 'mac-arm64.dmg', packInfo.name), undefined)
  })
})

function loadClient (fetch) {
  const source = fs.readFileSync(path.join(__dirname, '../../client/common/update-check.js'), 'utf8')
    .replace(/^import .*$/gm, '')
    .replace(/^export /gm, '')
  return vm.runInNewContext(source + '\n({ getLatestReleaseVersion, getLatestReleaseInfo, getDownloadUrl })', {
    fetch,
    packInfo,
    selectRelease,
    findReleaseAsset,
    dayjs: require('dayjs'),
    window: { store: { installSrc, getProxySetting: () => '' } }
  })
}

describe('client update checks', () => {
  test('requests our GitHub API without usage statistics', async () => {
    const calls = []
    const client = loadClient(async request => {
      calls.push(request)
      return [release()]
    })
    const info = await client.getLatestReleaseVersion()
    assert.equal(info.tag_name, 'v0.2.0')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].options.url, packInfo.releaseApiUrl)
    assert.equal(calls[0].options.headers.Accept, 'application/vnd.github+json')
    assert.equal(new URL(calls[0].options.url).searchParams.has('bookmark_count'), false)
  })

  test('allows empty release notes and keeps the native GitHub asset URL', async () => {
    const client = loadClient(async () => [release()])
    const info = await client.getLatestReleaseInfo()
    assert.equal(info.body, '')
    assert.equal(info.browserDownloadUrl, downloadUrl)
    assert.equal(client.getDownloadUrl(downloadUrl, 'sourceforge'), downloadUrl)
  })

  test('uses the checked release when loading its notes and installer', async () => {
    const client = loadClient(async () => { throw new Error('Unexpected second request') })
    const info = await client.getLatestReleaseInfo(release())
    assert.equal(info.browserDownloadUrl, downloadUrl)
  })

  test('returns a manual-download result for an unsupported installation target', async () => {
    const client = loadClient(async () => [release({ assets: [] })])
    const info = await client.getLatestReleaseInfo()
    assert.equal(info.browserDownloadUrl, '')
  })

  test('handles network failure without trying upstream mirrors', async () => {
    let calls = 0
    const client = loadClient(async () => {
      calls++
      throw new Error('Offline')
    })
    assert.equal(await client.getLatestReleaseVersion(), undefined)
    assert.equal(calls, 1)
  })
})

function loadDownloader (request, writer) {
  const source = fs.readFileSync(path.join(__dirname, '../../app/server/download-upgrade.js'), 'utf8')
  const exports = {}
  const dependencies = {
    fs: { createWriteStream: () => writer },
    path,
    '../lib/lodash.js': { throttle: fn => fn },
    axios: Object.assign(request, { defaults: {} }),
    '../common/runtime-constants': { packInfo, tempDir: '/tmp' },
    '../lib/install-src': installSrc,
    '../lib/fs': { fsExport: { openFile: () => {}, rmrf: async () => {} } },
    '../lib/proxy-agent': { createProxyAgent: () => undefined },
    '../common/log': { error: () => {} },
    './global-state': { removeUpgradeInst: () => {} }
  }
  vm.runInNewContext(source, {
    exports,
    require: name => {
      assert.ok(Object.hasOwn(dependencies, name), name)
      return dependencies[name]
    },
    process: { env: { NODE_TEST: '1' } }
  }, {
    filename: path.join(__dirname, '../../app/server/download-upgrade.js'),
    importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER
  })
  return exports.Upgrade
}

describe('installer downloader', () => {
  test('downloads our matching asset directly even with an old mirror preference', async () => {
    const calls = []
    const reader = new PassThrough()
    const writer = new PassThrough()
    const chunks = []
    writer.on('data', chunk => chunks.push(chunk))
    const Upgrade = loadDownloader(async options => {
      calls.push(options)
      return { data: calls.length === 1 ? [release()] : reader }
    }, writer)
    const messages = []
    let finish
    const completed = new Promise(resolve => { finish = resolve })
    const ws = {
      s: data => {
        messages.push(data)
        if (data.id === 'transfer:end:test') finish()
      }
    }
    await new Upgrade({ id: 'test', ws, mirror: 'atomgit' }).init()
    reader.end(Buffer.from('test'))
    await completed
    assert.equal(calls[0].url, packInfo.releaseApiUrl)
    assert.equal(calls[1].url, downloadUrl)
    assert.equal(Buffer.concat(chunks).toString(), 'test')
    assert.ok(messages.some(message => message.id === 'upgrade:data:test' && message.data === 100))
  })

  test('reports missing installers through the update error channel', async () => {
    const Upgrade = loadDownloader(async () => ({ data: [release({ assets: [] })] }))
    const messages = []
    await new Upgrade({ id: 'missing', ws: { s: data => messages.push(data) } }).init()
    assert.equal(messages.length, 1)
    assert.equal(messages[0].id, 'upgrade:err:missing')
    assert.match(messages[0].error.message, /No matching installer/)
  })

  test('reports API errors once and preserves their cause', async () => {
    const Upgrade = loadDownloader(async () => { throw new Error('API unavailable') })
    const messages = []
    await new Upgrade({ id: 'offline', ws: { s: data => messages.push(data) } }).init()
    assert.equal(messages.length, 1)
    assert.equal(messages[0].id, 'upgrade:err:offline')
    assert.equal(messages[0].error.message, 'API unavailable')
  })
})
