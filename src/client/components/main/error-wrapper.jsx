import React from 'react'
import { FrownOutlined, ReloadOutlined, CopyOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import {
  logoPath1,
  packInfo,
  isMac,
  isWin
} from '../../common/constants'
import Link from '../common/external-link'
import { copy } from '../../common/clipboard'

const e = window.translate
const os = isMac ? 'mac' : isWin ? 'windows' : 'linux'
const isVersion2OrAbove = Number((window.pre.versions?.node || '24').split('.')[0]) >= 22

const userDataPath = {
  mac: '~/Library/Application\\ Support/electerm_slim/users/default_user',
  linux: '~/.config/electerm_slim/users/default_user',
  windows: 'C:\\Users\\your-user-name\\AppData\\Roaming\\electerm_slim\\users\\default_user'
}

const troubleshootContent = {
  runInCommandLine: {
    mac: '/Applications/electerm_slim.app/Contents/MacOS/electerm_slim',
    linux: 'path/to/electerm-slim',
    windows: 'path\\to\\electerm_slim.exe'
  },
  clearConfig: {
    mac: isVersion2OrAbove
      ? `rm -rf ${userDataPath.mac}/electerm_slim_data.db`
      : `rm -rf ${userDataPath.mac}/electerm_slim.data.nedb`,
    linux: isVersion2OrAbove
      ? `rm -rf ${userDataPath.linux}/electerm_slim_data.db`
      : `rm -rf ${userDataPath.linux}/electerm_slim.data.nedb`,
    windows: isVersion2OrAbove
      ? `Delete ${userDataPath.windows}\\electerm_slim_data.db`
      : `Delete ${userDataPath.windows}\\electerm_slim.data.nedb`
  },
  backupData: {
    mac: `cp -r ${userDataPath.mac} ~/Desktop/electerm_slim_backup_${Date.now()}`,
    linux: `cp -r ${userDataPath.linux} ~/Desktop/electerm_slim_backup_${Date.now()}`,
    windows: `xcopy "${userDataPath.windows}\\*" "%USERPROFILE%\\Desktop\\electerm_slim_backup_${Date.now()}" /E /I`
  }
}

export default class ErrorBoundary extends React.PureComponent {
  constructor (props) {
    super(props)
    this.state = {
      hasError: false,
      error: {}
    }
  }

  componentDidCatch (error) {
    console.error(error)
    this.setState({
      hasError: true,
      error
    })
  }

  handleReload = () => {
    window.location.reload()
  }

  renderIconCopy = (cmd) => {
    return (
      <CopyOutlined
        className='mg2l pointer'
        onClick={() => copy(cmd)}
      />
    )
  }

  renderTroubleShoot = () => {
    if (window.et.isWebApp) {
      return this.renderContacts()
    }
    return (
      <div className='pd1y wordbreak'>
        <h2>{e('troubleShoot')}</h2>
        <p>electerm_slim Version: {packInfo.version}, OS: {os}</p>
        {
          Object.keys(troubleshootContent).map((k, i) => {
            const v = troubleshootContent[k]
            const cmd = v[os]
            return (
              <div className='pd1b' key={k}>
                <h3>{e(k)} {this.renderIconCopy(cmd)}</h3>
                <p><code>{cmd}</code></p>
              </div>
            )
          })
        }
        {this.renderContacts()}
      </div>
    )
  }

  renderContacts () {
    const {
      bugs: {
        url: bugReportLink
      }
    } = packInfo
    const bugUrl = `${bugReportLink}/new/choose`
    return (
      <>
        <div className='pd1b'>
          <Link to={bugUrl}>{e('bugReport')}</Link>
        </div>
      </>
    )
  }

  render () {
    if (this.state.hasError) {
      const { stack, message } = this.state.error
      return (
        <div className='pd3 error-wrapper'>
          <div className='pd2y'>
            <img src={logoPath1} className='iblock mwm-100' width={100} />
          </div>
          <h1>
            <FrownOutlined className='mg1r iblock' />
            <span className='iblock mg1r'>{e('error')}</span>
            <Button
              onClick={this.handleReload}
              icon={<ReloadOutlined />}
            >
              {e('reload')}
            </Button>
          </h1>
          <div className='pd1y'>{message}</div>
          <div className='pd1y'>{stack}</div>
          {
            this.renderTroubleShoot()
          }
        </div>
      )
    }
    return this.props.children
  }
}
