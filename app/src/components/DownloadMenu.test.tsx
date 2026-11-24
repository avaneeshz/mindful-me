import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DownloadMenuView } from './DownloadMenu'

const base = {
  open: false,
  pending: null,
  error: null,
  dayLabel: 'Fri, Sep 11',
  frameLabel: 'Frame 2',
  onToggle: () => {},
  onSelect: () => {},
} as const

describe('DownloadMenuView', () => {
  it('renders a real, labeled, enabled menu button at rest, with the menu closed', () => {
    const html = renderToStaticMarkup(<DownloadMenuView {...base} />)
    expect(html).toMatch(/<button[^>]*aria-label="Download"/)
    expect(html).toContain('aria-haspopup="menu"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('disabled=""')
    expect(html).not.toContain('role="menu"')
  })

  it('offers both downloads when open, each naming what it will contain', () => {
    const html = renderToStaticMarkup(<DownloadMenuView {...base} open />)
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('role="menu"')
    expect(html).toContain('Day summary')
    expect(html).toContain('Fri, Sep 11')
    expect(html).toContain('Current layout')
    expect(html).toContain('Frame 2')
    expect(html.match(/role="menuitem"/g)).toHaveLength(2)
  })

  it('disables the trigger and shows a spinner while a file is being built', () => {
    const html = renderToStaticMarkup(<DownloadMenuView {...base} pending="layout" />)
    expect(html).toMatch(/<button[^>]*aria-label="Preparing your download…"/)
    expect(html).toContain('disabled=""')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('animate-spin')
  })

  it('surfaces a failure as an alert without disabling the trigger', () => {
    const html = renderToStaticMarkup(<DownloadMenuView {...base} error="Could not build the file — try again." />)
    expect(html).toContain('role="alert"')
    expect(html).not.toContain('disabled=""')
  })

  it('shows no alert when nothing has failed', () => {
    expect(renderToStaticMarkup(<DownloadMenuView {...base} />)).not.toContain('role="alert"')
  })
})
