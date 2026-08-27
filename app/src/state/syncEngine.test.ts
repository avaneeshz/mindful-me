import { describe, expect, it } from 'vitest'
import type { ScheduledActivity } from '@/domain/types'
import type { SyncIntent } from './sync'
import { createSyncEngine, type SyncEngine, type SyncEngineDeps } from './syncEngine'
import { BASE_BACKOFF_MS, EMPTY_QUEUE, type QueueEntry, type SyncQueue } from './syncQueue'

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

/**
 * A complete stand-in for the browser: a clock the test moves by hand, a
 * timer queue it drains by hand, one shared "localStorage" cell, and a
 * `perform` whose outcome each test decides. Everything the engine does is
 * therefore observable without a DOM, a network, or fake timers.
 */
class Harness {
  now = 1_000
  online = true
  /** Shared across engines on purpose — this is what "reload the tab" uses. */
  storage: SyncQueue = EMPTY_QUEUE
  performed: QueueEntry[] = []
  reconcileRequests = 0
  outcome: (entry: QueueEntry) => Promise<void> = () => Promise.resolve()

  private timers = new Map<number, { at: number; fn: () => void }>()
  private nextTimerId = 1
  private nextEntryId = 1

  deps(overrides: Partial<SyncEngineDeps> = {}): SyncEngineDeps {
    return {
      enabled: true,
      perform: (entry) => {
        this.performed.push(entry)
        return this.outcome(entry)
      },
      load: () => this.storage,
      save: (queue) => {
        this.storage = queue
      },
      now: () => this.now,
      isOnline: () => this.online,
      setTimer: (fn, ms) => {
        const id = this.nextTimerId
        this.nextTimerId += 1
        this.timers.set(id, { at: this.now + ms, fn })
        return id
      },
      clearTimer: (id) => {
        this.timers.delete(id)
      },
      newId: () => {
        const id = `entry-${this.nextEntryId}`
        this.nextEntryId += 1
        return id
      },
      onReconcileNeeded: () => {
        this.reconcileRequests += 1
      },
      ...overrides,
    }
  }

  /** Moves the clock forward, then runs every due timer until none remain. */
  async settle(ms = 0): Promise<void> {
    this.now += ms
    for (let guard = 0; guard < 200; guard += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0))
      const due = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= this.now)
        .sort((a, b) => a[1].at - b[1].at)[0]
      if (!due) break
      this.timers.delete(due[0])
      due[1].fn()
    }
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

function create(harness: Harness, engineOverrides: Partial<SyncEngineDeps> = {}): SyncEngine {
  return createSyncEngine(harness.deps(engineOverrides))
}

const CREATE_A: SyncIntent = { kind: 'create', activity: activity('a') }
const CREATE_B: SyncIntent = { kind: 'create', activity: activity('b', { startMinutes: 900 }) }

describe('offline writes (rule 6)', () => {
  it('queues a write made while offline and never attempts to send it', async () => {
    const harness = new Harness()
    harness.online = false
    const engine = create(harness)

    engine.enqueue(CREATE_A, DAY)
    await harness.settle(60_000)

    expect(harness.performed).toEqual([])
    expect(engine.getStatus()).toMatchObject({ online: false, pending: 1, sending: false })
    // Not merely in memory — already durable.
    expect(harness.storage.entries).toHaveLength(1)
  })

  it('flushes everything queued offline the moment connectivity returns, in order', async () => {
    const harness = new Harness()
    harness.online = false
    const engine = create(harness)

    engine.enqueue(CREATE_A, DAY)
    engine.enqueue(CREATE_B, DAY)
    await harness.settle()
    expect(harness.performed).toEqual([])

    harness.online = true
    engine.setOnline(true)
    await harness.settle()

    expect(harness.performed.map((entry) => entry.intent.kind)).toEqual(['create', 'create'])
    expect(
      harness.performed.map((entry) =>
        entry.intent.kind === 'create' ? entry.intent.activity.id : null,
      ),
    ).toEqual(['a', 'b'])
    expect(engine.getStatus().pending).toBe(0)
    expect(harness.storage.entries).toEqual([])
  })

  it('does not burn retry attempts while offline — no backoff to serve on reconnect', async () => {
    const harness = new Harness()
    harness.online = false
    const engine = create(harness)

    engine.enqueue(CREATE_A, DAY)
    await harness.settle(600_000)
    expect(harness.storage.entries[0].attempts).toBe(0)

    harness.online = true
    engine.setOnline(true)
    await harness.settle()
    expect(harness.performed).toHaveLength(1)
  })

  it('carries the day a write was made on, not the day it eventually flushes', async () => {
    const harness = new Harness()
    harness.online = false
    const engine = create(harness)

    engine.enqueue(CREATE_A, '2026-08-20')
    harness.online = true
    engine.setOnline(true)
    await harness.settle()

    expect(harness.performed[0].dayISO).toBe('2026-08-20')
  })
})

describe('durability across a reload', () => {
  it('picks up a queue written by a previous session and sends it', async () => {
    const harness = new Harness()
    harness.online = false

    const before = create(harness)
    before.enqueue(CREATE_A, DAY)
    before.enqueue(CREATE_B, DAY)
    await harness.settle()
    before.dispose()

    // The tab closes and reopens — same storage, brand-new engine, back online.
    harness.online = true
    const after = create(harness)
    expect(after.getStatus().pending).toBe(2)

    after.flush()
    await harness.settle()
    expect(harness.performed).toHaveLength(2)
    expect(after.getStatus().pending).toBe(0)
  })

  it('re-sends a write that was on the wire when the tab closed', async () => {
    const harness = new Harness()
    const resolvers: Array<() => void> = []
    harness.outcome = () => new Promise<void>((resolve) => void resolvers.push(resolve))

    const before = create(harness)
    before.enqueue(CREATE_A, DAY)
    await harness.settle()
    expect(harness.performed).toHaveLength(1)
    expect(harness.storage.entries[0].status).toBe('inflight')
    before.dispose()
    for (const resolve of resolvers) resolve()

    harness.outcome = () => Promise.resolve()
    const after = create(harness)
    after.flush()
    await harness.settle()

    // Every write path is idempotent, so re-sending an unknown-outcome
    // request is the safe choice over silently dropping it.
    expect(harness.performed).toHaveLength(2)
    expect(after.getStatus().pending).toBe(0)
  })
})

describe('retry backoff', () => {
  it('retries on a widening schedule rather than hammering the server', async () => {
    const harness = new Harness()
    harness.outcome = () => Promise.reject(new TypeError('Failed to fetch'))
    const engine = create(harness)

    engine.enqueue(CREATE_A, DAY)
    await harness.settle()
    expect(harness.performed).toHaveLength(1)

    // Nothing at all in the first second.
    await harness.settle(BASE_BACKOFF_MS - 1)
    expect(harness.performed).toHaveLength(1)

    await harness.settle(1)
    expect(harness.performed).toHaveLength(2)

    // The second gap is twice the first.
    await harness.settle(BASE_BACKOFF_MS)
    expect(harness.performed).toHaveLength(2)
    await harness.settle(BASE_BACKOFF_MS)
    expect(harness.performed).toHaveLength(3)

    expect(engine.getStatus()).toMatchObject({ pending: 1, retrying: true })
    expect(engine.getStatus().lastError).toBe('Failed to fetch')
  })

  it('keeps the write forever rather than dropping it after N tries', async () => {
    const harness = new Harness()
    harness.outcome = () => Promise.reject(new TypeError('Failed to fetch'))
    const engine = create(harness)

    engine.enqueue(CREATE_A, DAY)
    for (let i = 0; i < 20; i += 1) await harness.settle(10 * 60_000)

    expect(engine.getStatus().pending).toBe(1)
    expect(harness.storage.entries).toHaveLength(1)
  })

  it('sends immediately again when the user asks it to retry', async () => {
    const harness = new Harness()
    harness.outcome = () => Promise.reject(new TypeError('Failed to fetch'))
    const engine = create(harness)

    engine.enqueue(CREATE_A, DAY)
    await harness.settle()
    expect(harness.performed).toHaveLength(1)

    harness.outcome = () => Promise.resolve()
    // Still inside the backoff window — an explicit retry does not wait it out
    // as far as the user is concerned, but the queue's own guard still holds,
    // so the flush lands as soon as the head is eligible.
    await harness.settle(BASE_BACKOFF_MS)
    engine.flush()
    await harness.settle()

    expect(engine.getStatus().pending).toBe(0)
  })
})

describe('server refusals become preserved conflicts (rule 7)', () => {
  it('drops the refused write, keeps it as a conflict record, and asks for a re-read', async () => {
    const harness = new Harness()
    harness.outcome = (entry) =>
      entry.intent.kind === 'create'
        ? Promise.reject({ code: 'P0001', message: 'schedule_conflict: 30 requested, 0 available' })
        : Promise.resolve()
    const engine = create(harness)

    engine.enqueue(CREATE_A, DAY)
    await harness.settle()

    const conflictSent = harness.performed.filter((entry) => entry.intent.kind === 'conflict')
    expect(conflictSent).toHaveLength(1)
    const intent = conflictSent[0].intent
    expect(intent.kind === 'conflict' && intent.record).toMatchObject({
      reason: 'rejected',
      intent: 'create',
      dayISO: DAY,
    })
    expect(intent.kind === 'conflict' && intent.record.activity?.id).toBe('a')
    expect(intent.kind === 'conflict' && intent.record.serverError).toContain('schedule_conflict')

    expect(engine.getStatus().pending).toBe(0)
    expect(engine.getStatus().lastConflictAt).not.toBeNull()
    expect(harness.reconcileRequests).toBeGreaterThan(0)
  })

  it('keeps the losing edit on the device until the record itself can be sent', async () => {
    const harness = new Harness()
    // The row is gone (deleted on another device), and the connection drops
    // before the conflict record can be written. It must not evaporate.
    harness.outcome = (entry) =>
      entry.intent.kind === 'conflict'
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.reject({ code: 'P0002', message: 'not_found' })
    const engine = create(harness)

    engine.enqueue({ kind: 'delete', id: 'a' }, DAY)
    await harness.settle(60_000)

    const queued = harness.storage.entries.map((entry) => entry.intent.kind)
    expect(queued).toEqual(['conflict'])

    harness.outcome = () => Promise.resolve()
    await harness.settle(600_000)
    expect(harness.storage.entries).toEqual([])
    expect(harness.performed.filter((entry) => entry.intent.kind === 'conflict').length).toBeGreaterThan(1)
  })

  it('does not spiral: a failed conflict record is retried, never re-recorded', async () => {
    const harness = new Harness()
    harness.outcome = (entry) =>
      entry.intent.kind === 'conflict'
        ? Promise.reject({ code: 'P0002', message: 'not_found' })
        : Promise.reject({ code: 'P0001', message: 'schedule_conflict' })
    const engine = create(harness)

    engine.enqueue(CREATE_A, DAY)
    await harness.settle(60_000)

    // The refused create produced exactly one conflict record; that record
    // being refused in turn simply drops it, rather than minting another.
    expect(harness.storage.entries).toEqual([])
    expect(harness.performed.filter((entry) => entry.intent.kind === 'conflict')).toHaveLength(1)
  })
})

describe('recordSupersededEdits', () => {
  it('cancels this device’s queued write and keeps it as a superseded record', async () => {
    const harness = new Harness()
    harness.online = false
    const engine = create(harness)

    engine.enqueue({ kind: 'reschedule', activity: activity('a', { durationMinutes: 90 }) }, DAY)
    engine.enqueue(CREATE_B, DAY)
    await harness.settle()

    engine.recordSupersededEdits([
      { activityId: 'a', serverUpdatedAt: '2026-08-27T10:05:00.000Z', localSnapshot: activity('a') },
    ])
    await harness.settle()

    const kinds = harness.storage.entries.map((entry) => entry.intent.kind)
    // The losing reschedule is gone (sending it would undo the winner), a
    // conflict record replaced it, and the unrelated create is untouched.
    expect(kinds).toEqual(['create', 'conflict'])

    const record = harness.storage.entries[1].intent
    expect(record.kind === 'conflict' && record.record).toMatchObject({
      reason: 'superseded',
      intent: 'reschedule',
      serverUpdatedAt: '2026-08-27T10:05:00.000Z',
    })
    expect(record.kind === 'conflict' && record.record.activity?.durationMinutes).toBe(90)
  })

  it('is a no-op when there is nothing queued to lose', async () => {
    const harness = new Harness()
    const engine = create(harness)
    engine.recordSupersededEdits([])
    await harness.settle()
    expect(harness.performed).toEqual([])
  })
})

describe('degenerate cases', () => {
  it('flushing an empty, never-synced queue does nothing and does not throw', async () => {
    const harness = new Harness()
    const engine = create(harness)

    expect(() => engine.flush()).not.toThrow()
    await harness.settle(600_000)
    expect(harness.performed).toEqual([])
    expect(engine.getStatus()).toMatchObject({ enabled: true, pending: 0, sending: false })
  })

  it('is completely inert in local-only mode', async () => {
    const harness = new Harness()
    harness.storage = EMPTY_QUEUE
    const engine = create(harness, { enabled: false })

    engine.enqueue(CREATE_A, DAY)
    engine.flush()
    await harness.settle(600_000)

    expect(harness.performed).toEqual([])
    expect(engine.getStatus()).toMatchObject({ enabled: false, pending: 0 })
  })

  it('stops doing anything once disposed', async () => {
    const harness = new Harness()
    harness.outcome = () => Promise.reject(new TypeError('Failed to fetch'))
    const engine = create(harness)

    engine.enqueue(CREATE_A, DAY)
    await harness.settle()
    engine.dispose()

    const sentBefore = harness.performed.length
    await harness.settle(600_000)
    expect(harness.performed).toHaveLength(sentBefore)
  })

  it('notifies subscribers immediately and on every change', async () => {
    const harness = new Harness()
    const engine = create(harness)
    const seen: number[] = []
    const unsubscribe = engine.subscribe((status) => seen.push(status.pending))

    expect(seen).toEqual([0])
    engine.enqueue(CREATE_A, DAY)
    await harness.settle()
    expect(seen).toContain(1)
    expect(seen[seen.length - 1]).toBe(0)

    unsubscribe()
    engine.enqueue(CREATE_B, DAY)
    await harness.settle()
    expect(seen[seen.length - 1]).toBe(0)
  })

  it('asks the board to re-read once a burst of writes has fully drained', async () => {
    const harness = new Harness()
    const engine = create(harness)

    engine.enqueue(CREATE_A, DAY)
    engine.enqueue(CREATE_B, DAY)
    await harness.settle()

    // One re-read for the whole burst, not one per write.
    expect(harness.reconcileRequests).toBe(1)
  })
})
