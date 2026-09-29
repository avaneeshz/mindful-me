import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const conn = vi.hoisted(() => ({
  state: {
    configured: true,
    status: null as null | { status: string; lastSyncedAt: string | null; lastError: string | null },
    statusLoading: false,
    summaries: [] as unknown[],
    summariesLoading: false,
    connecting: false,
    connectError: null,
    recoverable: false,
    restoring: false,
    restoreError: null,
    syncing: false,
    syncMessage: null,
    disconnecting: false,
    connect: () => {},
    syncNow: () => {},
    restore: () => {},
    disconnect: async () => true,
  },
}))
vi.mock('@/state/useHealthConnection', () => ({ useHealthConnection: () => conn.state }))
vi.mock('@/lumen/lib/store', () => ({ useStore: () => ({ openSettings: () => {} }) }))

import { AddDeviceScreen, DevicesScreen } from './devices'

const noop = () => {}

describe('Lumen Devices & apps', () => {
  it('shows an empty state with an Add device action when nothing is connected', () => {
    conn.state.configured = true
    conn.state.status = null
    const html = renderToStaticMarkup(<DevicesScreen onBack={noop} />)
    expect(html).toContain('No devices connected')
    expect(html).toContain('Add device')
  })

  it('shows the connected device with its status and a Sync now action', () => {
    conn.state.status = { status: 'connected', lastSyncedAt: null, lastError: null }
    const html = renderToStaticMarkup(<DevicesScreen onBack={noop} />)
    expect(html).toContain('Fitbit &amp; Google Health')
    expect(html).toContain('Connected · last synced never')
    expect(html).toContain('Sync now')
  })

  it('offers reconnect when the connection needs re-authorizing', () => {
    conn.state.status = { status: 'needs_reauth', lastSyncedAt: null, lastError: null }
    const html = renderToStaticMarkup(<DevicesScreen onBack={noop} />)
    expect(html).toContain('Needs to be re-authorized')
    expect(html).toContain('Reconnect')
  })

  it('explains local-only mode instead of offering to add a device', () => {
    conn.state.configured = false
    const html = renderToStaticMarkup(<DevicesScreen onBack={noop} />)
    expect(html).toContain('local-only mode')
    expect(html).not.toContain('Add device')
  })

  it('lists only Fitbit & Google Health in the picker', () => {
    conn.state.configured = true
    conn.state.status = null
    const html = renderToStaticMarkup(<AddDeviceScreen onBack={noop} />)
    expect(html).toContain('Fitbit &amp; Google Health')
    expect(html).not.toContain('Whoop')
    expect(html).not.toContain('Strava')
  })
})
