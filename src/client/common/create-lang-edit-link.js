import { packInfo } from './constants'

export default function createLangEditLink (lang) {
  const title = encodeURIComponent(`Translation feedback: ${lang}`)
  return `${packInfo.bugs.url}/new?title=${title}`
}
