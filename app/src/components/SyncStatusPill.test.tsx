import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SyncStatusPill, describeSyncIndicator } from './SyncStatusPill'
import { CONFLICT_NOTICE_MS, type SyncStatus } from '@/state/syncEngine'

const NOW = 1_000_000

function status(overrides: Partial<SyncStatus> = {}): SyncStatus {
  return {
    enabled: true,
    online: true,
    pending: 0,
    sending: false,
    retrying: false,
    lastError: null,
    lastSyncedAt: null,
    lastConflictAt: null,
    ...overrides,
  }
}

describe('describeSyncIndicator', () => {
  it('says nothing at all when everything is synced — no permanent status badge', () => {
    expect(describeSyncIndicator(status(), NOW)).toBeNull()
    expect(describeSyncIndicator(status({ lastSyncedAt: NOW - 1_000 }), NOW)).toBeNull()
  })

  it('says nothing in local-only mode, where there is no backend to sync to', () => {
    expect(describeSyncIndicator(status({ enabled: false, pending: 3, online: false }), NOW)).toBeNull()
  })

  it('reports offline, and how much is waiting', () => {
    expect(describeSyncIndicator(status({ online: false }), NOW)).toMatchObject({
      tone: 'offline',
      label: 'Offline',
      actionable: false,
    })

    const withPending = describeSyncIndicator(status({ online: false, pending: 3 }), NOW)
    expect(withPending?.label).toBe('Offline · 3 unsynced')
    expect(withPending?.detail).toContain('saved on this device')
  })

  it('uses singular phrasing for one waiting change', () => {
    const view = describeSyncIndicator(status({ online: false, pending: 1 }), NOW)
    expect(view?.detail).toContain('1 change is')
  })

  it('offers a retry only when writes are genuinely not getting through', () => {
    const view = describeSyncIndicator(
      status({ pending: 2, retrying: true, lastError: 'Failed to fetch' }),
      NOW,
    )
    expect(view).toMatchObject({ tone: 'problem', actionable: true })
    expect(view?.label).toBe('Can’t sync · 2 waiting')
    expect(view?.detail).toContain('Failed to fetch')
  })

  it('prefers "offline" over "can’t sync" — the honest cause comes first', () => {
    const view = describeSyncIndicator(status({ online: false, pending: 1, retrying: true }), NOW)
    expect(view?.tone).toBe('offline')
  })

  it('shows a plain syncing state while writes are in flight', () => {
    expect(describeSyncIndicator(status({ pending: 1, sending: true }), NOW)).toMatchObject({
      tone: 'busy',
      label: 'Syncing…',
      actionable: false,
    })
  })

  it('surfaces a rule-7 resolution briefly, then goes quiet again', () => {
    const conflicted = status({ lastConflictAt: NOW - 1_000 })
    expect(describeSyncIndicator(conflicted, NOW)).toMatchObject({
      tone: 'conflict',
      label: 'Updated from another device',
    })
    expect(describeSyncIndicator(conflicted, NOW + CONFLICT_NOTICE_MS)).toBeNull()
  })

  it('tells the user the replaced version is kept, never that it was lost', () => {
    const view = describeSyncIndicator(status({ lastConflictAt: NOW }), NOW)
    expect(view?.detail).toContain('kept')
  })
})

describe('<SyncStatusPill>', () => {
  function render(value: SyncStatus): string {
    return renderToStaticMarkup(<SyncStatusPill status={value} onRetry={() => {}} />)
  }

  it('renders nothing when there is nothing to report', () => {
    expect(render(status())).toBe('')
    expect(render(status({ enabled: false, online: false, pending: 4 }))).toBe('')
  })

  it('renders an announced, non-interactive chip when offline', () => {
    const html = render(status({ online: false, pending: 2 }))
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('Offline · 2 unsynced')
    expect(html).not.toContain('<button')
  })

  it('renders a real, labelled button when a retry is possible', () => {
    const html = render(status({ pending: 1, retrying: true, lastError: 'Failed to fetch' }))
    expect(html).toContain('<button')
    expect(html).toContain('type="button"')
    expect(html).toContain('Retry now.')
    expect(html).toContain('focus-visible:outline')
  })

  it('gives every state a full-sentence accessible label, not just the short pill text', () => {
    const html = render(status({ pending: 3, sending: true }))
    expect(html).toContain('aria-label="Saving 3 changes to your account."')
  })
})
