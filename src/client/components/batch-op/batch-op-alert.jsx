import React from 'react'
import { Alert } from 'antd'
import ExternalLink from '../common/external-link'

const batchOpWikiLink = 'https://github.com/fayev1t/electerm_slim/blob/master/src/docs/usage.md'

export default function BatchOpAlert () {
  const description = (
    <>
      <p>Actions: <code>connect, command, sftp_upload, sftp_download</code></p>
      <div><ExternalLink to={batchOpWikiLink}>{batchOpWikiLink}</ExternalLink></div>
    </>
  )

  return (
    <Alert
      description={description}
      type='info'
      showIcon
      className='mg1b'
    />
  )
}
