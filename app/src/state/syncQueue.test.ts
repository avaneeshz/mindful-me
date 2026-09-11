import { describe, expect, it } from 'vitest'
import {
  activitySyncState,
  backoffMs,
  describeSyncError,
  describeSyncIndicator,
  enqueueIntents,
  intentActivityId,
  markQueueItemFailed,
  nextItemToAttempt,
  pendingActivityIds,
  pendingDeleteActivityIds,
  removeQueueItem,
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
  it('is hidden when the queue is empty — a fully-synced board shows nothing', () => {
    expect(describeSyncIndicator([])).toEqual({ kind: 'hidden' })
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

  it('clears back to hidden once the last outstanding item resolves', () => {
    let queue = enqueueIntents([], [{ kind: 'create', activity: activity('a1') }], '2026-09-12', NOW, makeId)
    queue = markQueueItemFailed(queue, queue[0].id, 'boom', NOW)
    queue = removeQueueItem(queue, queue[0].id)
    expect(describeSyncIndicator(queue)).toEqual({ kind: 'hidden' })
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
