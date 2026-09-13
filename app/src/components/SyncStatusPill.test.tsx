import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SyncStatusPill } from './SyncStatusPill'
import type { SyncQueue } from '@/state/syncQueue'
import type { ScheduledActivity } from '@/domain/types'

function noop(): void {}

function activity(id: string): ScheduledActivity {
  return {
    id,
    name: 'Homework',
    path: [],
    startMinutes: 480,
    durationMinutes: 30,
    flags: [],
    quality: [],
    symptoms: [],
    notes: null,
    reflections: [],
    sleepQuality: [],
    dreamsNote: null,
    status: 'planned',
    timezone: 'UTC',
  }
}

function pendingQueue(count: number): SyncQueue {
  return Array.from({ length: count }, (_, i) => ({
    id: `q${i}`,
    intent: { kind: 'create' as const, activity: activity(`a${i}`) },
    activityId: `a${i}`,
    referenceDateISO: '2026-09-12',
    attempts: 0,
    status: 'pending' as const,
    lastError: null,
    nextAttemptAt: 0,
  }))
}

function failedQueue(count: number): SyncQueue {
  return pendingQueue(count).map((item) => ({ ...item, status: 'failed' as const, attempts: 1, lastError: 'boom' }))
}

describe('SyncStatusPill', () => {
  it('renders a calm, always-visible synced state instead of nothing — product override of the original hidden-when-synced design', () => {
    const html = renderToStaticMarkup(<SyncStatusPill queue={[]} onRetryNow={noop} />)
    expect(html).not.toBe('')
    expect(html).toContain('role="status"')
    expect(html).toContain('title="Synced"')
    expect(html).toContain('All changes synced')
  })

  it('does not animate the synced icon — only the syncing state carries motion', () => {
    const html = renderToStaticMarkup(<SyncStatusPill queue={[]} onRetryNow={noop} />)
    expect(html).not.toContain('animate-pulse')
    expect(html).not.toContain('animate-spin')
  })

  it('tints the synced icon green via the shared status token, not the whole chip', () => {
    const html = renderToStaticMarkup(<SyncStatusPill queue={[]} onRetryNow={noop} />)
    expect(html).toContain('text-status-success')
    // The chip's own fill/border stay the neutral, theme-agnostic tone —
    // colour lands on the icon only (CLAUDE.md's "no colour anywhere" still
    // governs the chrome; this is a narrow, icon-only exception).
    expect(html).toContain('bg-surface')
  })

  it('shows a pending state with no Retry action while nothing has failed yet', () => {
    const html = renderToStaticMarkup(<SyncStatusPill queue={pendingQueue(2)} onRetryNow={noop} />)
    expect(html).toContain('Saving 2 changes…')
    expect(html).not.toContain('Retry now')
  })

  it('uses singular wording for exactly one pending change', () => {
    const html = renderToStaticMarkup(<SyncStatusPill queue={pendingQueue(1)} onRetryNow={noop} />)
    expect(html).toContain('Saving 1 change…')
  })

  it('animates and tints the syncing icon amber', () => {
    const html = renderToStaticMarkup(<SyncStatusPill queue={pendingQueue(1)} onRetryNow={noop} />)
    expect(html).toContain('animate-pulse')
    expect(html).toContain('text-status-syncing')
  })

  it('shows a failed state, tinted red, closed with no popover content yet', () => {
    const html = renderToStaticMarkup(<SyncStatusPill queue={failedQueue(3)} onRetryNow={noop} />)
    expect(html).toContain('Couldn&#x27;t sync 3 changes')
    expect(html).toContain('text-status-error')
    // "Retry now" now lives inside the click-to-open popover, not inline in
    // the collapsed label — see the component's own doc comment for why.
    expect(html).not.toContain('Retry now')
  })

  it('uses singular wording for exactly one failed change', () => {
    const html = renderToStaticMarkup(<SyncStatusPill queue={failedQueue(1)} onRetryNow={noop} />)
    expect(html).toContain('Couldn&#x27;t sync 1 change')
  })

  it('is persistent, not a dismissible toast — no close control, and announces politely', () => {
    const html = renderToStaticMarkup(<SyncStatusPill queue={failedQueue(1)} onRetryNow={noop} />)
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('role="status"')
    expect(html).not.toContain('aria-label="Dismiss')
  })

  it('is not hidden on mobile, unlike the weather pill — this is data-safety information', () => {
    const html = renderToStaticMarkup(<SyncStatusPill queue={pendingQueue(1)} onRetryNow={noop} />)
    expect(html).not.toContain('mobile:hidden')
  })

  // --- Click-to-explain popover -------------------------------------------
  //
  // This suite (like every other popover in this file's neighbours —
  // `SupplementsButton.test.tsx`, and `HeaderBar`'s own `DatePill`/
  // `AccountMenu`, neither of which have dedicated interaction tests) is
  // SSR-string based (`renderToStaticMarkup`), which never mounts real DOM
  // event handlers — there is no `fireEvent.click` anywhere in this
  // codebase's test suite to actually simulate opening a popover. What IS
  // verifiable statically, and is what these tests assert: the trigger is a
  // genuine `<button>` (so Enter/Space activate it and outside-click/Escape
  // close it via the exact same mechanic `SupplementsButton` already uses,
  // not a new one), it exposes `aria-haspopup`/`aria-expanded` like every
  // other popover trigger in this app, and the popover's own content is
  // absent from the markup until `open` flips true (mirroring
  // `SupplementsButton`'s "shows no checklist... while closed" test).
  const cases: [string, SyncQueue][] = [
    ['synced', []],
    ['syncing', pendingQueue(1)],
    ['failed', failedQueue(1)],
  ]
  for (const [name, queue] of cases) {
    it(`${name} state: renders a real, keyboard-operable <button> that starts closed`, () => {
      const html = renderToStaticMarkup(<SyncStatusPill queue={queue} onRetryNow={noop} />)
      expect(html).toMatch(/<button[^>]*>/)
      expect(html).not.toContain('tabindex="-1"')
      expect(html).toContain('aria-haspopup="dialog"')
      expect(html).toContain('aria-expanded="false"')
      expect(html).not.toContain('role="dialog"')
    })
  }
})
