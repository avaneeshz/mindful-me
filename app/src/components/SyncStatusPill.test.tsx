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
  it('renders nothing at all when fully synced — never a permanent "Synced" badge', () => {
    const html = renderToStaticMarkup(<SyncStatusPill queue={[]} onRetryNow={noop} />)
    expect(html).toBe('')
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

  it('shows a failed state with a real, labeled Retry action', () => {
    const html = renderToStaticMarkup(<SyncStatusPill queue={failedQueue(3)} onRetryNow={noop} />)
    expect(html).toContain('Couldn&#x27;t sync 3 changes')
    expect(html).toContain('<button')
    expect(html).toContain('Retry now')
    expect(html).toMatch(/aria-label="Retry syncing now[^"]*"/)
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
})
