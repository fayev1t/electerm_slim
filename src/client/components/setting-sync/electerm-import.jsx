import { useEffect, useState } from 'react'
import { Alert, Button, Space } from 'antd'
import { ImportOutlined, FolderOpenOutlined } from '@ant-design/icons'
import { dbNamesForWatch, fetchInitData } from '../../common/db'
import { refsStatic } from '../common/ref'
import deepCopy from 'json-deep-copy'
import { runImportTask } from '../../common/import-task'
import ShowItem from '../common/show-item'

const e = window.translate

export default function ElectermImport () {
  const [info, setInfo] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => {
    window.pre.runGlobalAsync('getElectermImportInfo').then(setInfo).catch(error => setError(error.message))
  }, [])

  async function performImport (source) {
    const watchers = [...dbNamesForWatch.map(name => window[`watch${name}`]), window.watchConfig].filter(Boolean)
    let committed = false
    let refreshed = false
    window.migrating = true
    watchers.forEach(watcher => watcher.stop())
    try {
      const imported = await window.pre.runGlobalAsync('importElectermData', source)
      committed = true
      const datasets = await Promise.all(dbNamesForWatch.map(async name => [name, JSON.parse(await fetchInitData(name))]))
      const { store } = window
      for (const [name, items] of datasets) {
        store.setItems(name, items)
        refsStatic.add('oldState-' + name, deepCopy(items))
      }
      store.bookmarksMap = new Map(store.bookmarks.map(bookmark => [bookmark.id, bookmark]))
      store._config = imported.config
      store.setTheme(imported.config.theme)
      refreshed = true
      setResult(imported)
      setInfo(await window.pre.runGlobalAsync('getElectermImportInfo', source))
    } catch (error) {
      setError(error.message)
      // If the files were committed but refreshing failed, load their state
      // afresh before any old renderer snapshot can write back over them.
      if (committed && !refreshed) window.location.reload()
    } finally {
      if (!committed || refreshed) {
        window.migrating = false
        watchers.forEach(watcher => {
          watcher.reseed?.()
          watcher.start()
        })
      }
    }
  }

  async function importData (source) {
    setBusy(true)
    setError('')
    const outcome = await runImportTask({
      useModal: false,
      cancelable: false,
      steps: [{ run: () => performImport(source) }]
    })
    if (outcome.error) setError(outcome.error.message)
    setBusy(false)
  }

  async function chooseSource (file = false) {
    try {
      const selected = await window.api.openDialog({
        title: e(file ? 'chooseElectermExport' : 'chooseElectermFolder'),
        properties: [file ? 'openFile' : 'openDirectory', 'showHiddenFiles'],
        ...(file ? { filters: [{ name: 'JSON', extensions: ['json'] }] } : {})
      })
      if (selected?.[0]) await importData(selected[0])
    } catch (error) {
      setError(error.message)
    }
  }

  return (
    <div className='pd2 electerm-import'>
      <p className='wordbreak'>{e('dataLocation')}: {info && <ShowItem to={info.dataPath}>{info.dataPath}</ShowItem>}</p>
      <p className='wordbreak'>{e('electermImportHint')}</p>
      <Space wrap>
        <Button
          type='primary'
          icon={<ImportOutlined />}
          loading={busy}
          disabled={!info?.found}
          onClick={() => importData(info.sourcePath)}
          className='import-electerm-button'
        >{e('importFromElecterm')}
        </Button>
        <Button icon={<FolderOpenOutlined />} disabled={busy} onClick={() => chooseSource()}>
          {e('chooseElectermFolder')}
        </Button>
        <Button icon={<ImportOutlined />} disabled={busy} onClick={() => chooseSource(true)}>
          {e('chooseElectermExport')}
        </Button>
      </Space>
      <p className='mg1t wordbreak'>
        {info?.found ? info.profilePath : e('electermImportNotFound')}
      </p>
      {error && <Alert type='error' showIcon title={error} />}
      {result && (
        <Alert
          type='success'
          showIcon
          title={e('electermImportSuccess')}
          description={
            <ShowItem className='wordbreak' to={result.backupPath}>{e('electermImportBackup')}: {result.backupPath}</ShowItem>
          }
          className='electerm-import-success'
        />
      )}
    </div>
  )
}
