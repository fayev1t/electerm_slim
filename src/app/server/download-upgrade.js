/**
 * download upgrade class
 */

const fs = require('fs')
const { resolve } = require('path')
const _ = require('../lib/lodash.js')
const rp = require('axios')
const { packInfo, tempDir } = require('../common/runtime-constants')
const installSrc = require('../lib/install-src')
const { fsExport } = require('../lib/fs')
const { createProxyAgent } = require('../lib/proxy-agent')
const { openFile, rmrf } = fsExport
const log = require('../common/log')
const globalState = require('./global-state')

rp.defaults.proxy = false

async function getReleaseInfo (agent) {
  const { selectRelease, findReleaseAsset } = await import('../common/release-info.mjs')
  const conf = {
    url: packInfo.releaseApiUrl,
    headers: { Accept: 'application/vnd.github+json' },
    timeout: 15000
  }
  if (agent) {
    conf.httpAgent = agent
    conf.httpsAgent = agent
  }
  return rp(conf)
    .then((res) => {
      return findReleaseAsset(selectRelease(res.data), installSrc, packInfo.name)
    })
}

class Upgrade {
  constructor (options) {
    this.options = options
  }

  async init () {
    const {
      id,
      ws,
      proxy
    } = this.options
    const agent = createProxyAgent(proxy)
    let releaseInfo
    try {
      releaseInfo = await getReleaseInfo(agent)
    } catch (err) {
      this.onError(err, id, ws)
      return
    }
    if (!releaseInfo) {
      this.onError(new Error('No matching installer in this release'), id, ws)
      return
    }
    const localPath = resolve(tempDir, releaseInfo.name)
    const remotePath = releaseInfo.browser_download_url
    await rmrf(localPath).catch(log.error)
    const { size } = releaseInfo
    this.id = id
    this.localPath = localPath
    const readSteam = await rp({
      url: remotePath,
      httpAgent: agent,
      httpsAgent: agent,
      responseType: 'stream'
    })
      .then(r => r.data)
      .catch(err => {
        this.onError(err, id, ws)
      })
    if (!readSteam) {
      return
    }
    const writeSteam = fs.createWriteStream(localPath)

    let count = 0

    this.pausing = false

    this.onData = _.throttle((count) => {
      if (this.onDestroy) {
        return
      }

      ws.s({
        id: 'upgrade:data:' + id,
        data: Math.floor(count * 100 / size)
      })
    }, 1000)

    readSteam.on('data', chunk => {
      const res = writeSteam.write(chunk)
      if (res) {
        count += chunk.length
        this.onData(count)
      } else {
        readSteam.pause()
        writeSteam.once('drain', () => {
          count += chunk.length
          this.onData(count)
          if (!this.pausing) {
            readSteam.resume()
          }
        })
      }
    })

    readSteam.on('close', () => {
      writeSteam.end('', () => this.onEnd(id, ws))
    })

    readSteam.on('error', (err) => this.onError(err, id, ws))

    this.readSteam = readSteam
    this.writeSteam = writeSteam
    this.ws = ws
    this.destroy = this.destroy.bind(this)
  }

  onEnd (id, ws) {
    if (!this.onDestroy) {
      // In test runs the download is only exercised for progress reporting;
      // opening the installer (mounting a dmg, showing Finder) would steal
      // GUI focus on CI runners and break every test that runs afterwards.
      if (!process.env.NODE_TEST) {
        openFile(this.localPath)
        process.send({
          showFileInFolder: this.localPath
        })
      }
      ws.s({
        id: 'transfer:end:' + id,
        data: this.dir
      })
    }
  }

  onError (err, id, ws) {
    ws.s({
      id: 'upgrade:err:' + id,
      error: {
        message: err.message,
        stack: err.stack
      }
    })
  }

  pause () {
    this.pausing = true
    this.readSteam.pause()
  }

  resume () {
    this.pausing = false
    this.readSteam.resume()
  }

  destroy () {
    this.onDestroy = true
    this.readSteam && this.readSteam.destroy()
    this.ws && this.ws.close()
    globalState.removeUpgradeInst(this.id)
  }

  // end
}

exports.Upgrade = Upgrade
