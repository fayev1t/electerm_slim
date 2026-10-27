/**
 * multi language support
 */

const { isDev, defaultLang } = require('../common/runtime-constants')
const { resolve } = require('path')
const moveToTopLabels = {
  zh_cn: '移到顶部工具栏',
  zh_tw: '移至頂部工具列'
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
          moveToTop: moveToTopLabels[id] || 'Move to top toolbar'
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
