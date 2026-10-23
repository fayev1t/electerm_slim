import { auto } from 'manate/react'
import Layouts from './layouts'
import TabsWrap from '../tabs/index'
import {
  splitConfig,
  shortcutBarHeight
} from '../../common/constants'
import layoutAlg from './layout-alg'
import calcSessionSize from './session-size-alg'
import SessionsWrap from '../session/sessions'
import pixed from './pixed'
import { pick } from 'lodash-es'
import './layout.styl'

export default auto(function Layout (props) {
  const { store } = props
  const {
    layout
  } = store
  const conf = splitConfig[layout]

  const handleMousedown = (e) => {

  }

  const calcLayoutStyle = () => {
    const {
      width,
      height,
      isMobile,
      leftSidePanelWidth,
      leftSideBarWidth,
      pinned,
      rightPanelVisible,
      rightPanelPinned,
      rightPanelWidth,
      resizeTrigger,
      shortcutBarVisible,
      shortcutBarKbOffset
    } = props.store
    const h = height - (shortcutBarVisible ? shortcutBarHeight + shortcutBarKbOffset : 0) + resizeTrigger
    const l = pinned && !isMobile ? leftSideBarWidth + leftSidePanelWidth : leftSideBarWidth
    const r = rightPanelVisible && rightPanelPinned && !isMobile ? rightPanelWidth : 0
    return {
      height: h,
      top: 0,
      left: l,
      width: Math.max(0, width - l - r)
    }
  }

  const layoutSize = calcLayoutStyle()
  const {
    width,
    height
  } = layoutSize
  const pixedLayoutStyle = pixed(layoutSize)
  const styles = layoutAlg(layout, width, height)
  const layoutProps = {
    layout,
    ...styles,
    layoutStyle: pixedLayoutStyle,
    handleMousedown
  }
  const sizes = calcSessionSize(layout, width, height)

  function renderSessions (conf, layout) {
    const {
      store
    } = props
    const { tabs } = store
    const tabsBatch = {}
    for (const tab of tabs) {
      let { batch } = tab
      // Guard against tabs with missing/invalid batch (e.g. created by
      // MCP/AI operations before sanitization). Route them to pane 0
      // instead of crashing or disappearing.
      batch = Number(batch)
      if (!Number.isInteger(batch) || batch < 0 || batch >= sizes.length) {
        batch = 0
      }
      if (!tabsBatch[batch]) {
        tabsBatch[batch] = []
      }
      tabsBatch[batch].push(tab)
    }
    return sizes.map((v, i) => {
      const sessProps = {
        batch: i,
        layout,
        currentBatchTabId: store[`activeTabId${i}`],
        ...v,
        tabs: tabsBatch[i] || [],
        ...pick(store, [
          'isMaximized',
          'config',
          'resolutions',
          'fileOperation',
          'pinnedQuickCommandBar',
          'tabsHeight',
          'appPath',
          'leftSidePanelWidth',
          'addPanelWidth',
          'pinned',
          'openedSideBar',
          'isMobile'
        ])
      }
      return (
        <TabsWrap
          key={'sess' + i}
          {...sessProps}
        />
      )
    })
  }

  const sessionsProps = {
    styles: styles.wrapStyles,
    sizes,
    width,
    height,
    layoutStyle: pixedLayoutStyle,
    ...pick(store, [
      'activeTabId',
      'activeTabId0',
      'activeTabId1',
      'activeTabId2',
      'activeTabId3',
      'batch',
      'resolutions',
      'fileOperation',
      'file',
      'pinnedQuickCommandBar',
      'tabsHeight',
      'appPath',
      'leftSidePanelWidth',
      'pinned',
      'openedSideBar',
      'config',
      'fullscreen'
    ]),
    tabs: store.tabs,
    layout
  }
  return [
    <Layouts {...layoutProps} key='layouts'>
      {renderSessions(conf, layout)}
    </Layouts>,
    <SessionsWrap key='SessionsWrap' {...sessionsProps} />
  ]
})
