import { describe, expect, it } from 'vitest'
import type { ScheduledActivity } from '@/domain/types'
import type { SyncIntent } from './sync'
import {
  BASE_BACKOFF_MS,
  EMPTY_QUEUE,
  MAX_BACKOFF_MS,
  backoffDelayMs,
  cancelPendingFor,
  classifySyncFailure,
  describeSyncError,
  enqueue,
  markFailed,
  markInFlight,
  markSucceeded,
  pendingEditsById,
  rearm,
  summarize,
  takeNext,
  type SyncQueue,
} from './syncQueue'

const DAY = '2026-08-27'

function activity(id: string, overrides: Partial<ScheduledActivity> = {}): ScheduledActivity {
  return {
    id,
    name: 'Homework',
    path: [],
    startMinutes: 600,
    durationMinutes: 30,
    flags: [],
    status: 'planned',
    timezone: 'Asia/Kolkata',
    ...overrides,
  }
}

let nextId = 0
function add(queue: SyncQueue, intent: SyncIntent, now = 1_000): SyncQueue {
  nextId += 1
  return enqueue(queue, { entryId: `e${nextId}`, intent, dayISO: DAY, now })
}

function kinds(queue: SyncQueue): string[] {
  return queue.entries.map((entry) => entry.intent.kind)
}

describe('backoffDelayMs', () => {
  it('doubles from the base delay and never exceeds the cap', () => {
    expect(backoffDelayMs(0)).toBe(0)
    expect(backoffDelayMs(1)).toBe(BASE_BACKOFF_MS)
    expect(backoffDelayMs(2)).toBe(2 * BASE_BACKOFF_MS)
    expect(backoffDelayMs(3)).toBe(4 * BASE_BACKOFF_MS)
    expect(backoffDelayMs(9)).toBe(256 * BASE_BACKOFF_MS)
    expect(backoffDelayMs(10)).toBe(MAX_BACKOFF_MS)
  })

  it('stays finite (and capped) for an absurd attempt count', () => {
    expect(backoffDelayMs(5_000)).toBe(MAX_BACKOFF_MS)
    expect(Number.isFinite(backoffDelayMs(5_000))).toBe(true)
  })

  it('spaces ten failures over minutes, not milliseconds — never hammering', () => {
    let total = 0
    for (let attempt = 1; attempt <= 10; attempt += 1) total += backoffDelayMs(attempt)
    // 1+2+4+…+256 seconds, then the 5-minute cap.
    expect(total).toBe(511 * BASE_BACKOFF_MS + MAX_BACKOFF_MS)
    expect(total).toBeGreaterThan(8 * 60_000)
  })
})

describe('classifySyncFailure', () => {
  it('treats the server’s own refusals as permanent', () => {
    expect(classifySyncFailure({ code: 'P0001', message: 'schedule_conflict' })).toBe('permanent')
    expect(classifySyncFailure({ code: 'P0002', message: 'not_found' })).toBe('permanent')
    expect(classifySyncFailure({ code: '23P01' })).toBe('permanent')
    expect(classifySyncFailure({ code: '23514' })).toBe('permanent')
    expect(classifySyncFailure({ code: '22023' })).toBe('permanent')
  })

  it('treats anything connectivity-shaped as retryable — a write is never dropped for bad luck', () => {
    expect(classifySyncFailure(new TypeError('Failed to fetch'))).toBe('retryable')
    expect(classifySyncFailure({ message: 'NetworkError when attempting to fetch resource.' })).toBe(
      'retryable',
    )
    expect(classifySyncFailure({ code: '' })).toBe('retryable')
    expect(classifySyncFailure({ code: '57014' })).toBe('retryable') // query_canceled
    expect(classifySyncFailure(null)).toBe('retryable')
    expect(classifySyncFailure(undefined)).toBe('retryable')
    expect(classifySyncFailure('boom')).toBe('retryable')
  })

  it('does not drop writes for a broken deployment — that stalls visibly instead', () => {
    // 42501 insufficient_privilege / 42883 undefined_function mean the backend
    // is misconfigured, not that this edit lost. Retrying keeps the data.
    expect(classifySyncFailure({ code: '42501' })).toBe('retryable')
    expect(classifySyncFailure({ code: '42883' })).toBe('retryable')
  })
})

describe('describeSyncError', () => {
  it('prefers a message, falls back to a string, and never returns empty', () => {
    expect(describeSyncError({ message: 'schedule_conflict' })).toBe('schedule_conflict')
    expect(describeSyncError('offline')).toBe('offline')
    expect(describeSyncError({})).toBe('Unknown sync error')
    expect(describeSyncError(null)).toBe('Unknown sync error')
  })
})

describe('enqueue coalescing', () => {
  it('appends independent intents in order', () => {
    let queue = add(EMPTY_QUEUE, { kind: 'create', activity: activity('a') })
    queue = add(queue, { kind: 'create', activity: activity('b') })
    expect(kinds(queue)).toEqual(['create', 'create'])
  })

  it('folds a reschedule into a create that has not been sent', () => {
    let queue = add(EMPTY_QUEUE, { kind: 'create', activity: activity('a') })
    queue = add(queue, {
      kind: 'reschedule',
      activity: activity('a', { durationMinutes: 90 }),
    })

    expect(kinds(queue)).toEqual(['create'])
    const intent = queue.entries[0].intent
    expect(intent.kind === 'create' && intent.activity.durationMinutes).toBe(90)
  })

  it('does NOT fold a status change into a pending create (create always inserts "planned")', () => {
    let queue = add(EMPTY_QUEUE, { kind: 'create', activity: activity('a') })
    queue = add(queue, { kind: 'status', activity: activity('a', { status: 'completed' }) })
    expect(kinds(queue)).toEqual(['create', 'status'])
  })

  it('keeps only the newest of repeated edits to the same facet', () => {
    let queue = add(EMPTY_QUEUE, { kind: 'reschedule', activity: activity('a', { durationMinutes: 30 }) })
    queue = add(queue, { kind: 'reschedule', activity: activity('a', { durationMinutes: 45 }) })
    queue = add(queue, { kind: 'reschedule', activity: activity('a', { durationMinutes: 60 }) })

    expect(queue.entries).toHaveLength(1)
    const intent = queue.entries[0].intent
    expect(intent.kind === 'reschedule' && intent.activity.durationMinutes).toBe(60)
  })

  it('drops both halves when an unsent create is deleted — the server never knew', () => {
    let queue = add(EMPTY_QUEUE, { kind: 'create', activity: activity('a') })
    queue = add(queue, { kind: 'status', activity: activity('a', { status: 'completed' }) })
    queue = add(queue, { kind: 'delete', id: 'a' })
    expect(queue.entries).toEqual([])
  })

  it('cancels an unsent delete when the removal is undone', () => {
    let queue = add(EMPTY_QUEUE, { kind: 'delete', id: 'a' })
    queue = add(queue, { kind: 'restore', id: 'a' })
    expect(queue.entries).toEqual([])
  })

  it('drops queued edits to a row it is about to delete, but still sends the delete', () => {
    let queue = add(EMPTY_QUEUE, { kind: 'reschedule', activity: activity('a') })
    queue = add(queue, { kind: 'status', activity: activity('a', { status: 'completed' }) })
    queue = add(queue, { kind: 'delete', id: 'a' })
    expect(kinds(queue)).toEqual(['delete'])
  })

  it('never coalesces across different activities', () => {
    let queue = add(EMPTY_QUEUE, { kind: 'create', activity: activity('a') })
    queue = add(queue, { kind: 'delete', id: 'b' })
    expect(kinds(queue)).toEqual(['create', 'delete'])
  })

  it('never coalesces into an in-flight entry — its outcome still has to be honoured', () => {
    let queue = add(EMPTY_QUEUE, { kind: 'create', activity: activity('a') })
    queue = markInFlight(queue, queue.entries[0].entryId)
    queue = add(queue, { kind: 'reschedule', activity: activity('a', { durationMinutes: 90 }) })
    expect(kinds(queue)).toEqual(['create', 'reschedule'])
  })

  it('never coalesces conflict records — each one is its own preserved edit', () => {
    const record = {
      reason: 'rejected' as const,
      intent: 'create' as const,
      activity: activity('a'),
      editedAt: '2026-08-27T10:00:00.000Z',
      dayISO: DAY,
    }
    let queue = add(EMPTY_QUEUE, { kind: 'conflict', activityId: 'a', record })
    queue = add(queue, { kind: 'conflict', activityId: 'a', record })
    expect(kinds(queue)).toEqual(['conflict', 'conflict'])
  })

  it('clears an existing backoff when the user edits again', () => {
    let queue = add(EMPTY_QUEUE, { kind: 'reschedule', activity: activity('a') }, 1_000)
    queue = markFailed(queue, queue.entries[0].entryId, { now: 1_000, error: {} }).queue
    expect(queue.entries[0].nextAttemptAt).toBeGreaterThan(1_000)

    queue = add(queue, { kind: 'reschedule', activity: activity('a', { durationMinutes: 90 }) }, 2_000)
    expect(queue.entries[0].attempts).toBe(0)
    expect(queue.entries[0].nextAttemptAt).toBe(2_000)
  })
})

describe('takeNext', () => {
  it('returns nothing for an empty queue — a never-synced app must not error', () => {
    expect(takeNext(EMPTY_QUEUE, 0)).toBeNull()
    expect(summarize(EMPTY_QUEUE, 0)).toEqual({
      total: 0,
      sending: false,
      retrying: false,
      lastError: null,
      nextAttemptAt: null,
    })
    expect(pendingEditsById(EMPTY_QUEUE).size).toBe(0)
    expect(rearm(EMPTY_QUEUE, 0).entries).toEqual([])
  })

  it('serves strict FIFO and never skips past a backing-off head', () => {
    let queue = add(EMPTY_QUEUE, { kind: 'delete', id: 'a' }, 1_000)
    queue = add(queue, { kind: 'create', activity: activity('b') }, 1_000)

    queue = markFailed(queue, queue.entries[0].entryId, { now: 1_000, error: {} }).queue
    // The delete has to land before the create that reuses its time range —
    // so nothing goes early just because the head is waiting.
    expect(takeNext(queue, 1_100)).toBeNull()
    expect(takeNext(queue, 1_000 + BASE_BACKOFF_MS)?.intent.kind).toBe('delete')
  })

  it('returns nothing while the head is on the wire', () => {
    let queue = add(EMPTY_QUEUE, { kind: 'create', activity: activity('a') })
    queue = markInFlight(queue, queue.entries[0].entryId)
    expect(takeNext(queue, 10_000)).toBeNull()
  })
})

describe('markFailed', () => {
  it('backs a retryable failure off and keeps the entry', () => {
    let queue = add(EMPTY_QUEUE, { kind: 'create', activity: activity('a') }, 1_000)
    queue = markInFlight(queue, queue.entries[0].entryId)

    const first = markFailed(queue, queue.entries[0].entryId, {
      now: 5_000,
      error: new TypeError('Failed to fetch'),
    })
    expect(first.refused).toBeNull()
    expect(first.queue.entries[0].status).toBe('pending')
    expect(first.queue.entries[0].attempts).toBe(1)
    expect(first.queue.entries[0].nextAttemptAt).toBe(5_000 + BASE_BACKOFF_MS)
    expect(first.queue.entries[0].lastError).toBe('Failed to fetch')

    const second = markFailed(first.queue, first.queue.entries[0].entryId, {
      now: 9_000,
      error: new TypeError('Failed to fetch'),
    })
    expect(second.queue.entries[0].attempts).toBe(2)
    expect(second.queue.entries[0].nextAttemptAt).toBe(9_000 + 2 * BASE_BACKOFF_MS)
  })

  it('drops a permanently refused entry and hands it back for preservation (rule 7)', () => {
    const queue = add(EMPTY_QUEUE, { kind: 'create', activity: activity('a') }, 1_000)
    const outcome = markFailed(queue, queue.entries[0].entryId, {
      now: 5_000,
      error: { code: 'P0001', message: 'schedule_conflict: 30 minutes requested, 0 available' },
    })

    expect(outcome.queue.entries).toEqual([])
    expect(outcome.refused?.intent.kind).toBe('create')
    expect(outcome.refused?.lastError).toContain('schedule_conflict')
  })

  it('is a no-op for an entry that is no longer queued', () => {
    const outcome = markFailed(EMPTY_QUEUE, 'gone', { now: 1, error: {} })
    expect(outcome.queue).toBe(EMPTY_QUEUE)
    expect(outcome.refused).toBeNull()
  })
})

describe('rearm', () => {
  it('turns an interrupted in-flight entry back into a sendable one', () => {
    // Exactly the reload case: the tab closed mid-request, so the outcome is
    // unknown. Every write path is idempotent, so re-sending is safe.
    let queue = add(EMPTY_QUEUE, { kind: 'create', activity: activity('a') }, 1_000)
    queue = markInFlight(queue, queue.entries[0].entryId)
    queue = markFailed(queue, queue.entries[0].entryId, { now: 1_000, error: {} }).queue
    queue = markInFlight(queue, queue.entries[0].entryId)

    const rearmed = rearm(queue, 60_000)
    expect(rearmed.entries[0].status).toBe('pending')
    expect(rearmed.entries[0].attempts).toBe(0)
    expect(rearmed.entries[0].nextAttemptAt).toBe(60_000)
    expect(takeNext(rearmed, 60_000)).not.toBeNull()
  })
})

describe('pendingEditsById', () => {
  it('reports the newest queued edit per activity, and what it would do', () => {
    let queue = add(EMPTY_QUEUE, { kind: 'create', activity: activity('a') }, 1_000)
    queue = add(queue, { kind: 'status', activity: activity('a', { status: 'completed' }) }, 4_000)
    queue = add(queue, { kind: 'delete', id: 'b' }, 2_000)

    const pending = pendingEditsById(queue)
    expect(pending.get('a')).toEqual({
      editedAt: new Date(4_000).toISOString(),
      removes: false,
      creates: true,
    })
    expect(pending.get('b')?.removes).toBe(true)
  })

  it('ignores conflict records, which belong to no pending activity edit', () => {
    const queue = add(EMPTY_QUEUE, {
      kind: 'conflict',
      activityId: 'a',
      record: {
        reason: 'superseded',
        intent: 'reschedule',
        activity: activity('a'),
        editedAt: '2026-08-27T10:00:00.000Z',
        dayISO: DAY,
      },
    })
    expect(pendingEditsById(queue).size).toBe(0)
  })
})

describe('cancelPendingFor', () => {
  it('removes every pending write for one activity and returns them', () => {
    let queue = add(EMPTY_QUEUE, { kind: 'create', activity: activity('a') })
    queue = add(queue, { kind: 'create', activity: activity('b') })
    queue = add(queue, { kind: 'status', activity: activity('a', { status: 'completed' }) })

    const outcome = cancelPendingFor(queue, 'a')
    expect(outcome.cancelled.map((entry) => entry.intent.kind)).toEqual(['create', 'status'])
    expect(kinds(outcome.queue)).toEqual(['create'])
  })

  it('leaves an in-flight entry alone — it is already on the wire', () => {
    let queue = add(EMPTY_QUEUE, { kind: 'create', activity: activity('a') })
    queue = markInFlight(queue, queue.entries[0].entryId)
    const outcome = cancelPendingFor(queue, 'a')
    expect(outcome.cancelled).toEqual([])
    expect(outcome.queue).toBe(queue)
  })

  it('is a no-op for an activity with nothing queued', () => {
    const queue = add(EMPTY_QUEUE, { kind: 'create', activity: activity('a') })
    expect(cancelPendingFor(queue, 'z').queue).toBe(queue)
  })
})

describe('summarize', () => {
  it('separates "sending" from "not getting through"', () => {
    let queue = add(EMPTY_QUEUE, { kind: 'create', activity: activity('a') }, 1_000)
    expect(summarize(queue, 1_000)).toMatchObject({ total: 1, sending: false, retrying: false })

    queue = markInFlight(queue, queue.entries[0].entryId)
    expect(summarize(queue, 1_000)).toMatchObject({ sending: true, retrying: false })

    queue = markFailed(queue, queue.entries[0].entryId, { now: 1_000, error: { message: 'offline' } }).queue
    expect(summarize(queue, 1_000)).toMatchObject({
      sending: false,
      retrying: true,
      lastError: 'offline',
      nextAttemptAt: 1_000 + BASE_BACKOFF_MS,
    })
  })

  it('drops a succeeded entry entirely', () => {
    let queue = add(EMPTY_QUEUE, { kind: 'create', activity: activity('a') })
    queue = markSucceeded(queue, queue.entries[0].entryId)
    expect(queue.entries).toEqual([])
  })
})
