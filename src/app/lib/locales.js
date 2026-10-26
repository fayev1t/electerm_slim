/**
 * multi language support
 */

const { isDev, defaultLang } = require('../common/runtime-constants')
const { resolve } = require('path')
const moveToTopLabels = {
  zh_cn: '移到顶部工具栏',
  zh_tw: '移至頂部工具列'
}

const importLabels = {
  en: {
    dataLocation: 'Data directory',
    importFromElecterm: 'Import from electerm',
    chooseElectermFolder: 'Choose electerm data folder',
    chooseElectermExport: 'Import electerm export file',
    electermImportHint: 'Merge settings, bookmarks, themes, commands, workspaces and history. Matching IDs use the source data. Your current data is backed up first. The source stays unchanged; automatic sync stays off.',
    electermImportNotFound: 'No default electerm data found. Choose its data folder to import.',
    electermImportSuccess: 'electerm data imported',
    electermImportBackup: 'Backup before import'
  },
  zh: {
    dataLocation: '数据目录',
    importFromElecterm: '一键导入 electerm',
    chooseElectermFolder: '选择 electerm 数据目录',
    chooseElectermExport: '导入 electerm 导出文件',
    electermImportHint: '合并设置、书签、主题、命令、工作区和历史，同 ID 使用来源内容。导入前自动备份，原目录保持不变，自动同步保持关闭。',
    electermImportNotFound: '未检测到默认 electerm 数据，可选择原数据目录导入。',
    electermImportSuccess: 'electerm 数据导入成功',
    electermImportBackup: '导入前备份'
  }
}

function rebrandLocale (value) {
  return typeof value === 'string'
    ? value.replace(/electerm(?!_slim)/gi, 'electerm_slim')
    : value
}

function getOsLocale () {
  return require('os-locale-s')
    .osLocale()
    .catch(() => '')
}

async function loadLocales () {
  const sysLocale = await getOsLocale() || defaultLang
  const path = (isDev
    ? '../../'
    : '') +
    '../node_modules/@electerm/electerm-locales/dist/cjs'
  const localeFolder = resolve(__dirname, path)
  // languages array
  const langs = require(resolve(localeFolder, 'list.json'))
    .map(fileName => {
      const filePath = resolve(localeFolder, fileName)
      const lang = require(filePath)
      const id = fileName.replace('.js', '')
      return {
        path: filePath,
        id,
        name: lang.name,
        reg: lang.match,
        lang: {
          ...Object.fromEntries(Object.entries(lang.lang).map(([key, value]) => [
            key, rebrandLocale(value)
          ])),
          moveToTop: moveToTopLabels[id] || 'Move to top toolbar',
          ...importLabels[id.startsWith('zh_') ? 'zh' : 'en']
        }
      }
    })
  const langMap = langs.reduce((prev, l) => {
    prev[l.id] = l
    return prev
  }, {})
  return {
    langs,
    langMap,
    sysLocale
  }
}

function findLang (langs, la) {
  let res = false
  for (const l of langs) {
    res = new RegExp(l.reg).test(la)
    if (res) {
      res = l.id
      break
    }
  }
  return res
}

const getLang = (config, sysLocale, langs) => {
  if (config.language) {
    return config.language
  }
  let l = sysLocale
  l = l ? l.toLowerCase().replace('-', '_') : defaultLang
  return findLang(langs, l) || defaultLang
}

exports.getLang = getLang
exports.loadLocales = loadLocales
