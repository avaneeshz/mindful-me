import { describe, expect, it } from 'vitest'
import {
  activitySyncState,
  backoffMs,
  describeSyncError,
  describeSyncIndicator,
  discardActivityItems,
  enqueueIntents,
  intentActivityId,
  isPermanentSyncError,
  markQueueItemFailed,
  markQueueItemPermanent,
  nextItemToAttempt,
  pendingActivityIds,
  pendingDeleteActivityIds,
  removeQueueItem,
  retryAllQueueItems,
  retryQueueItem,
  syncQueueRows,
  type SyncQueue,
} from './syncQueue'
import type { SyncIntent } from './sync'
import type { ScheduledActivity } from '@/domain/types'

function activity(id: string, overrides: Partial<ScheduledActivity> = {}): ScheduledActivity {
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
    fieldSelections: {},
    dreamsNote: null,
    status: 'planned',
    timezone: 'UTC',
    ...overrides,
  }
}

let idCounter = 0
function makeId(): string {
  idCounter += 1
  return `q${idCounter}`
}

const NOW = 1_000_000

describe('intentActivityId', () => {
  it('extracts the acted-on activity id for every intent kind', () => {
    const a = activity('a1')
    const cases: [SyncIntent, string][] = [
      [{ kind: 'create', activity: a }, 'a1'],
      [{ kind: 'reschedule', activity: a }, 'a1'],
      [{ kind: 'flags', activity: a }, 'a1'],
      [{ kind: 'status', activity: a }, 'a1'],
      [{ kind: 'delete', id: 'a2' }, 'a2'],
      [{ kind: 'restore', id: 'a3' }, 'a3'],
      [{ kind: 'addReflection', scheduledActivityId: 'a4', card: 1, note: '' }, 'a4'],
      [{ kind: 'removeReflection', scheduledActivityId: 'a5', card: 1 }, 'a5'],
    ]
    for (const [intent, expected] of cases) {
      expect(intentActivityId(intent)).toBe(expected)
    }
  })
})

describe('enqueueIntents', () => {
  it('appends one queue entry per intent, due immediately, with no prior attempts', () => {
    const queue = enqueueIntents([], [{ kind: 'create', activity: activity('a1') }], '2026-09-12', NOW, makeId)
    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({
      activityId: 'a1',
      referenceDateISO: '2026-09-12',
      attempts: 0,
      status: 'pending',
      lastError: null,
      nextAttemptAt: NOW,
    })
  })

  it('is a no-op for an empty intent list — never mints an empty entry', () => {
    const queue: SyncQueue = []
    expect(enqueueIntents(queue, [], '2026-09-12', NOW, makeId)).toBe(queue)
  })

  it('preserves insertion order across multiple enqueue calls (FIFO)', () => {
    let queue = enqueueIntents([], [{ kind: 'create', activity: activity('a1') }], '2026-09-12', NOW, makeId)
    queue = enqueueIntents(queue, [{ kind: 'reschedule', activity: activity('a1') }], '2026-09-12', NOW, makeId)
    expect(queue.map((i) => i.intent.kind)).toEqual(['create', 'reschedule'])
  })
})

describe('backoffMs', () => {
  it('grows exponentially and is capped at 5 minutes', () => {
    expect(backoffMs(1)).toBe(30_000)
    expect(backoffMs(2)).toBe(60_000)
    expect(backoffMs(3)).toBe(120_000)
    expect(backoffMs(10)).toBe(5 * 60_000) // capped, not 30s * 2^9
  })
})

describe('markQueueItemFailed', () => {
  it('bumps attempts, marks failed, records the error, and schedules a backed-off retry', () => {
    const queue = enqueueIntents([], [{ kind: 'create', activity: activity('a1') }], '2026-09-12', NOW, makeId)
    const failed = markQueueItemFailed(queue, queue[0].id, 'network error', NOW)
    expect(failed[0]).toMatchObject({
      attempts: 1,
      status: 'failed',
      lastError: 'network error',
      nextAttemptAt: NOW + 30_000,
    })
  })

  it('keeps failing indefinitely rather than ever dropping the item (rule 6 — never silently discarded)', () => {
    let queue = enqueueIntents([], [{ kind: 'create', activity: activity('a1') }], '2026-09-12', NOW, makeId)
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      queue = markQueueItemFailed(queue, queue[0].id, `error ${attempt}`, NOW)
    }
    expect(queue).toHaveLength(1)
    expect(queue[0].attempts).toBe(8)
    expect(queue[0].status).toBe('failed')
    expect(queue[0].lastError).toBe('error 8')
  })

  it('leaves unrelated items untouched', () => {
    let queue = enqueueIntents([], [{ kind: 'create', activity: activity('a1') }], '2026-09-12', NOW, makeId)
    queue = enqueueIntents(queue, [{ kind: 'create', activity: activity('a2') }], '2026-09-12', NOW, makeId)
    const failed = markQueueItemFailed(queue, queue[0].id, 'boom', NOW)
    expect(failed[1]).toEqual(queue[1])
  })
})

describe('removeQueueItem', () => {
  it('removes exactly the named entry', () => {
    let queue = enqueueIntents([], [{ kind: 'create', activity: activity('a1') }], '2026-09-12', NOW, makeId)
    queue = enqueueIntents(queue, [{ kind: 'create', activity: activity('a2') }], '2026-09-12', NOW, makeId)
    const next = removeQueueItem(queue, queue[0].id)
    expect(next).toHaveLength(1)
    expect(next[0].activityId).toBe('a2')
  })
})

describe('nextItemToAttempt', () => {
  it('returns null for an empty queue', () => {
    expect(nextItemToAttempt([], NOW)).toBeNull()
  })

  it('returns the first item once it is due', () => {
    const queue = enqueueIntents([], [{ kind: 'create', activity: activity('a1') }], '2026-09-12', NOW, makeId)
    expect(nextItemToAttempt(queue, NOW)?.activityId).toBe('a1')
  })

  it('returns null while the only item is still backing off', () => {
    let queue = enqueueIntents([], [{ kind: 'create', activity: activity('a1') }], '2026-09-12', NOW, makeId)
    queue = markQueueItemFailed(queue, queue[0].id, 'boom', NOW)
    expect(nextItemToAttempt(queue, NOW + 1)).toBeNull() // backoff hasn't elapsed yet
    expect(nextItemToAttempt(queue, NOW + 30_000)?.id).toBe(queue[0].id) // now due
  })

  it('lets a DIFFERENT activity proceed even while an earlier one is backing off', () => {
    let queue = enqueueIntents([], [{ kind: 'create', activity: activity('a1') }], '2026-09-12', NOW, makeId)
    queue = markQueueItemFailed(queue, queue[0].id, 'boom', NOW) // a1 now backing off
    queue = enqueueIntents(queue, [{ kind: 'create', activity: activity('a2') }], '2026-09-12', NOW, makeId)
    const item = nextItemToAttempt(queue, NOW + 1)
    expect(item?.activityId).toBe('a2')
  })

  it('blocks a LATER item for the SAME activity behind an earlier unresolved one, even if the later one is due (per-activity FIFO)', () => {
    // A delete queued right behind a still-unsent create for the same id must
    // never race ahead of it.
    let queue = enqueueIntents([], [{ kind: 'create', activity: activity('a1') }], '2026-09-12', NOW, makeId)
    queue = markQueueItemFailed(queue, queue[0].id, 'boom', NOW) // create backs off
    queue = enqueueIntents(queue, [{ kind: 'delete', id: 'a1' }], '2026-09-12', NOW, makeId) // due immediately
    expect(nextItemToAttempt(queue, NOW + 1)).toBeNull() // blocked behind the backed-off create
    expect(nextItemToAttempt(queue, NOW + 30_000)?.intent.kind).toBe('create') // create retried first
  })
})

describe('pendingActivityIds / pendingDeleteActivityIds', () => {
  it('separates non-delete outstanding writes from outstanding deletes', () => {
    let queue = enqueueIntents([], [{ kind: 'create', activity: activity('a1') }], '2026-09-12', NOW, makeId)
    queue = enqueueIntents(queue, [{ kind: 'delete', id: 'a2' }], '2026-09-12', NOW, makeId)
    queue = enqueueIntents(queue, [{ kind: 'restore', id: 'a3' }], '2026-09-12', NOW, makeId)

    expect(pendingActivityIds(queue)).toEqual(new Set(['a1', 'a3']))
    expect(pendingDeleteActivityIds(queue)).toEqual(new Set(['a2']))
  })

  it('returns empty sets for an empty queue', () => {
    expect(pendingActivityIds([])).toEqual(new Set())
    expect(pendingDeleteActivityIds([])).toEqual(new Set())
  })
})

describe('activitySyncState', () => {
  it('is "synced" when nothing is queued for that activity', () => {
    expect(activitySyncState([], 'a1')).toBe('synced')
  })

  it('is "pending" for a queued item that has not yet failed', () => {
    const queue = enqueueIntents([], [{ kind: 'create', activity: activity('a1') }], '2026-09-12', NOW, makeId)
    expect(activitySyncState(queue, 'a1')).toBe('pending')
  })

  it('is "failed" once any of that activity’s queued items has failed at least once', () => {
    let queue = enqueueIntents([], [{ kind: 'create', activity: activity('a1') }], '2026-09-12', NOW, makeId)
    queue = markQueueItemFailed(queue, queue[0].id, 'boom', NOW)
    expect(activitySyncState(queue, 'a1')).toBe('failed')
  })

  it('never reports the wrong activity’s status', () => {
    let queue = enqueueIntents([], [{ kind: 'create', activity: activity('a1') }], '2026-09-12', NOW, makeId)
    queue = markQueueItemFailed(queue, queue[0].id, 'boom', NOW)
    queue = enqueueIntents(queue, [{ kind: 'create', activity: activity('a2') }], '2026-09-12', NOW, makeId)
    expect(activitySyncState(queue, 'a2')).toBe('pending')
  })
})

describe('describeSyncIndicator', () => {
  it('is synced when the queue is empty — a fully-synced board still reports a real, calm state', () => {
    expect(describeSyncIndicator([])).toEqual({ kind: 'synced' })
  })

  it('is pending, with a count, while nothing has failed yet', () => {
    let queue = enqueueIntents([], [{ kind: 'create', activity: activity('a1') }], '2026-09-12', NOW, makeId)
    queue = enqueueIntents(queue, [{ kind: 'create', activity: activity('a2') }], '2026-09-12', NOW, makeId)
    expect(describeSyncIndicator(queue)).toEqual({ kind: 'pending', count: 2 })
  })

  it('is failed, counting only the failed entries, once anything has failed at least once', () => {
    let queue = enqueueIntents([], [{ kind: 'create', activity: activity('a1') }], '2026-09-12', NOW, makeId)
    queue = enqueueIntents(queue, [{ kind: 'create', activity: activity('a2') }], '2026-09-12', NOW, makeId)
    queue = markQueueItemFailed(queue, queue[0].id, 'boom', NOW)
    expect(describeSyncIndicator(queue)).toEqual({ kind: 'failed', count: 1 })
  })

  it('clears back to synced once the last outstanding item resolves', () => {
    let queue = enqueueIntents([], [{ kind: 'create', activity: activity('a1') }], '2026-09-12', NOW, makeId)
    queue = markQueueItemFailed(queue, queue[0].id, 'boom', NOW)
    queue = removeQueueItem(queue, queue[0].id)
    expect(describeSyncIndicator(queue)).toEqual({ kind: 'synced' })
  })
})

describe('describeSyncError', () => {
  it('uses an Error’s message', () => {
    expect(describeSyncError(new Error('network down'))).toBe('network down')
  })

  it('passes through a plain string', () => {
    expect(describeSyncError('nope')).toBe('nope')
  })

  it('falls back for anything else, never leaking a raw object into the UI', () => {
    expect(describeSyncError({ weird: true })).toBe('Unknown error')
    expect(describeSyncError(undefined)).toBe('Unknown error')
  })
})

describe('refused-for-good writes', () => {
  const conflict = { code: 'P0001', message: 'schedule_conflict: 30 minutes requested, 0 available' }

  it('treats a rule the server enforces as permanent, and anything transient or unknown as retryable', () => {
    expect(isPermanentSyncError(conflict)).toBe(true)
    expect(isPermanentSyncError({ code: '22P02', message: 'invalid input syntax for type uuid' })).toBe(true)
    expect(isPermanentSyncError({ code: 'PGRST202', message: 'function not found' })).toBe(true)
    expect(isPermanentSyncError({ code: '23P01', message: 'exclusion violation' })).toBe(true)
    // Not permanent: a dropped connection, a timeout, an expired login, or something unrecognised.
    expect(isPermanentSyncError(new TypeError('Failed to fetch'))).toBe(false)
    expect(isPermanentSyncError({ code: 'PGRST301', message: 'JWT expired' })).toBe(false)
    expect(isPermanentSyncError({ code: '28000', message: 'not authenticated' })).toBe(false)
    expect(isPermanentSyncError('boom')).toBe(false)
    expect(isPermanentSyncError(undefined)).toBe(false)
  })

  it('reads the message off a plain error object', () => {
    expect(describeSyncError(conflict)).toBe('schedule_conflict: 30 minutes requested, 0 available')
  })

  it('parks a refused entry: kept, never due again on its own, and it holds back that activity only', () => {
    const a = activity('a1')
    const b = activity('b1')
    let queue = enqueueIntents([], [{ kind: 'create', activity: a }, { kind: 'create', activity: b }], '2026-10-13', NOW, makeId)
    queue = markQueueItemPermanent(queue, queue[0].id, conflict.message)
    expect(queue[0]).toMatchObject({ permanent: true, status: 'failed', attempts: 1 })
    // Even a year later it is not attempted; the other activity still goes through.
    expect(nextItemToAttempt(queue, NOW + 365 * 24 * 3_600_000)?.activityId).toBe('b1')
    // Its own later writes wait behind it (they depend on it existing).
    const withEdit = [...queue, ...enqueueIntents([], [{ kind: 'status', activity: a }], '2026-10-13', NOW, makeId)]
    expect(nextItemToAttempt(withEdit.filter((i) => i.activityId === 'a1'), NOW + 10 ** 12)).toBeNull()
  })

  it('keeps a refused entry protected from the server-reconcile, and reports it as refused', () => {
    const a = activity('a1')
    let queue = enqueueIntents([], [{ kind: 'create', activity: a }], '2026-10-13', NOW, makeId)
    queue = markQueueItemPermanent(queue, queue[0].id, conflict.message)
    expect(pendingActivityIds(queue).has('a1')).toBe(true)
    expect(activitySyncState(queue, 'a1')).toBe('rejected')
    expect(describeSyncIndicator(queue)).toEqual({ kind: 'failed', count: 1 })
  })

  it('"Try again" makes it due immediately; "Retry now" also un-parks everything', () => {
    let queue = enqueueIntents([], [{ kind: 'create', activity: activity('a1') }], '2026-10-13', NOW, makeId)
    queue = markQueueItemPermanent(queue, queue[0].id, conflict.message)
    const one = retryQueueItem(queue, queue[0].id, NOW + 5)
    expect(one[0]).toMatchObject({ permanent: false, status: 'pending', nextAttemptAt: NOW + 5 })
    expect(nextItemToAttempt(one, NOW + 5)?.id).toBe(queue[0].id)
    expect(retryAllQueueItems(queue, NOW + 7)[0]).toMatchObject({ permanent: false, nextAttemptAt: NOW + 7 })
  })

  it('editing a refused create re-sends the corrected create instead of queuing an edit behind it', () => {
    const original = activity('a1', { startMinutes: 600 })
    let queue = enqueueIntents([], [{ kind: 'create', activity: original }], '2026-10-13', NOW, makeId)
    queue = markQueueItemPermanent(queue, queue[0].id, conflict.message)
    const moved = activity('a1', { startMinutes: 900 })
    queue = enqueueIntents(queue, [{ kind: 'reschedule', activity: moved }], '2026-10-13', NOW + 50, makeId)
    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({ permanent: false, status: 'pending', attempts: 0, nextAttemptAt: NOW + 50 })
    expect(queue[0].intent).toEqual({ kind: 'create', activity: moved })
  })

  it('deleting a refused create just forgets it — there is nothing on the server to delete', () => {
    let queue = enqueueIntents([], [{ kind: 'create', activity: activity('a1') }], '2026-10-13', NOW, makeId)
    queue = markQueueItemPermanent(queue, queue[0].id, conflict.message)
    queue = enqueueIntents(queue, [{ kind: 'delete', id: 'a1' }], '2026-10-13', NOW, makeId)
    expect(queue).toEqual([])
  })

  it('does NOT shortcut for an ordinary (not refused) create: an edit or delete still queues behind it', () => {
    let queue = enqueueIntents([], [{ kind: 'create', activity: activity('a1') }], '2026-10-13', NOW, makeId)
    queue = markQueueItemFailed(queue, queue[0].id, 'Failed to fetch', NOW)
    queue = enqueueIntents(queue, [{ kind: 'delete', id: 'a1' }], '2026-10-13', NOW, makeId)
    expect(queue.map((i) => i.intent.kind)).toEqual(['create', 'delete'])
  })

  it('discarding forgets every queued write for that activity and nothing else', () => {
    const queue = enqueueIntents(
      [],
      [{ kind: 'create', activity: activity('a1') }, { kind: 'create', activity: activity('b1') }, { kind: 'status', activity: activity('a1') }],
      '2026-10-13',
      NOW,
      makeId,
    )
    expect(discardActivityItems(queue, 'a1').map((i) => i.activityId)).toEqual(['b1'])
  })

  it('reads a refused overlap in plain words, dated, and sorts refused entries first', () => {
    let queue = enqueueIntents(
      [],
      [{ kind: 'create', activity: activity('a1', { name: 'Walk', startMinutes: 750, durationMinutes: 30 }) }, { kind: 'create', activity: activity('b1') }],
      '2026-10-13',
      NOW,
      makeId,
    )
    queue = markQueueItemPermanent(queue, queue[0].id, conflict.message)
    const rows = syncQueueRows([queue[1], queue[0]], NOW)
    expect(rows[0]).toMatchObject({ state: 'rejected', activityId: 'a1' })
    expect(rows[0].title).toContain('Add “Walk”')
    expect(rows[0].title).toContain('13 Oct')
    expect(rows[0].reason).toContain('overlaps something already saved')
    expect(rows[1].state).toBe('sending')
  })

  it('an entry saved before this existed (no `permanent` field) behaves as not refused', () => {
    const legacy: SyncQueue = [
      { id: 'x', intent: { kind: 'create', activity: activity('a1') }, activityId: 'a1', referenceDateISO: '2026-10-03', attempts: 4, status: 'failed', lastError: 'x', nextAttemptAt: NOW },
    ]
    expect(activitySyncState(legacy, 'a1')).toBe('failed')
    expect(nextItemToAttempt(legacy, NOW)?.id).toBe('x')
  })
})
