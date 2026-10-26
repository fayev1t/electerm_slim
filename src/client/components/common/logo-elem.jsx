import { logoPath1, packInfo } from '../../common/constants'
import { Tag } from 'antd'
import './logo.styl'

export default function LogoElem () {
  return (
    <h1 className='logo-elem mg3y'>
      <img src={logoPath1} alt='' className='logo-img' />
      <span className='logo-name'>{packInfo.name}</span>
      <Tag color='#168b85' variant='solid'>{packInfo.version}</Tag>
    </h1>
  )
}
