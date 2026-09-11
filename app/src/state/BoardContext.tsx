import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
} from 'react'
import {
  boardReducer,
  createInitialState,
  type BoardAction,
  type BoardState,
} from './boardReducer'
import { createSeedActivities } from './seed'
import { slotIndexFromDate } from '@/domain/slots'
import { deriveSyncIntents, runIntent } from './sync'
import { loadLocalActivities, saveLocalActivities } from './localPersistence'
import { reconcileServerActivities } from './reconcileServerActivities'
import {
  enqueueIntents,
  markQueueItemFailed,
  nextItemToAttempt,
  pendingActivityIds,
  pendingDeleteActivityIds,
  removeQueueItem,
  describeSyncError,
  type SyncQueue,
} from './syncQueue'
import { loadSyncQueue, saveSyncQueue } from './syncQueueStorage'
import {
  dateFromLocalDateISO,
  isSameLocalDay,
  localDateISO,
  localDayRange,
  shouldRolloverViewedDate,
} from '@/lib/localTime'
import { apiListScheduledActivities } from '@/api/scheduledActivities'
import type { ScheduledActivity } from '@/domain/types'

/** How often the queue is woken to check for backed-off items becoming due again — see `drainQueue` below. */
const SYNC_RETRY_INTERVAL_MS = 15_000

interface BoardContextValue {
  state: BoardState
  dispatch: Dispatch<BoardAction>
  /** Real device time, re-read on a timer. Never a hardcoded index. */
  now: Date
  /** Slot index containing the real current time. */
  nowSlot: number
  /**
   * The calendar day the board is currently showing — "today" until the
   * user picks a different date from the header's date picker (BL-2).
   * Always a local-midnight instant (see `localDayRange`). While the board
   * is following "today" this ALSO advances on its own the instant the
   * device clock crosses local midnight, even with no reload — see the
   * rollover effect below and `shouldRolloverViewedDate`.
   */
  viewedDate: Date
  /** True exactly when `viewedDate` is the real current day. */
  isViewingToday: boolean
  /** Switch the whole board (timeline + editor) to a different day's schedule. */
  setViewedDate: (date: Date) => void
  /**
   * The durable background-sync retry queue (Bug B/C) — every write that
   * hasn't yet been CONFIRMED to have reached the server, whether it's
   * merely waiting its turn or has already failed at least once. Empty means
   * fully synced. See `state/syncQueue.ts` for the shape and
   * `SyncStatusPill`/`ActivitySummary` for how it's surfaced.
   */
  syncQueue: SyncQueue
  /** Wakes the queue immediately instead of waiting for the next backoff/interval tick — the sync indicator's "Retry now" action. */
  retrySyncNow: () => void
}

const BoardContext = createContext<BoardContextValue | null>(null)

/** How often the clock is re-read. A slot is 30 minutes; 30s is ample. */
const CLOCK_TICK_MS = 30_000

/**
 * Real device time, re-read on a timer — unless a fixed `Date` is injected, in
 * which case that instant is used and no timer runs.
 */
function useDeviceClock(fixed?: Date): Date {
  const [tick, setTick] = useState(() => new Date())

  useEffect(() => {
    if (fixed) return
    const id = window.setInterval(() => setTick(new Date()), CLOCK_TICK_MS)
    return () => window.clearInterval(id)
  }, [fixed])

  return fixed ?? tick
}

/**
 * The activities to show for `date` — local-first (rule 6), never the
 * network. Demo seed content is a first-ever-run "today" concept only: any
 * OTHER date with nothing in local storage (past, future, or "today" again
 * after storage was cleared on some other day) starts genuinely empty, never
 * silently reseeded with the demo schedule.
 */
function loadActivitiesForDate(date: Date, now: Date): ScheduledActivity[] {
  const local = loadLocalActivities(date)
  if (local) return local
  return isSameLocalDay(date, now) ? createSeedActivities() : []
}

export interface BoardProviderProps {
  children: ReactNode
  /**
   * Pins "now" to a fixed instant. Tests MUST pass this: without it the
   * rendered board depends on the wall-clock time the suite happens to run at
   * (which slot is "now", which slot the editor opens on, what it contains),
   * and assertions about that slot pass or fail by the hour.
   *
   * Omitted in the app — real device time is used, exactly as before. Also
   * disables the Supabase sign-in/hydrate/sync effects below, so a test
   * never depends on network state.
   */
  now?: Date
}

export function BoardProvider({ children, now: fixedNow }: BoardProviderProps) {
  const isTest = fixedNow !== undefined
  const now = useDeviceClock(fixedNow)

  // BL-2: the day being VIEWED, independent of the real current instant
  // above. Defaults to today, exactly as the board always has — see
  // `isViewingToday`/`setViewedDate` below for how navigating away from it
  // works. Always normalized to local midnight so it can be compared and
  // used as a local-storage/fetch-range key the same way everywhere.
  const [viewedDate, setViewedDateState] = useState<Date>(() => localDayRange(now).start)

  // Phase 1 -> Phase 2 persistence boundary: an in-memory-only board used to
  // be seeded fresh on every load. Now the FIRST render prefers whatever was
  // last written to this device (rule 6's "instant local" side of local-
  // first) so a reload never loses today's board while a background fetch
  // reconciles against the server. Only a genuinely first-ever run (nothing
  // in local storage yet, viewing today) falls back to the demo seed content.
  const [state, dispatch] = useReducer(boardReducer, undefined, () => {
    const activities = isTest ? createSeedActivities() : loadActivitiesForDate(viewedDate, now)
    return createInitialState(activities, now)
  })

  // Tracks the most recently dispatched action so the effect below can derive
  // sync intents from EXACTLY the (action, prevState, nextState) triple React
  // itself just reduced — never a second, independent call to `boardReducer`
  // for the same action, which would mint a fresh id for a new activity and
  // desync it from what actually rendered (`commit`/`toggleFlag` create a new
  // id via `crypto.randomUUID()`, which is not reproducible).
  const lastActionRef = useRef<BoardAction | null>(null)
  const prevStateRef = useRef(state)

  // Always the LATEST rendered state, read by async callbacks (the server
  // reconciliation effect below) that must merge against whatever the user
  // has done most recently, not a stale closure from whenever the fetch
  // began. Assigning during render (not inside an effect) is deliberate — an
  // effect-based assignment would still lag one render behind the async
  // callback's own read.
  const latestStateRef = useRef(state)
  latestStateRef.current = state

  const trackedDispatch: Dispatch<BoardAction> = (action) => {
    lastActionRef.current = action
    dispatch(action)
  }

  // Bug B/C (write-failure-visibility incident) — the durable retry queue.
  // `queue` drives the UI (the sync indicator, `ActivitySummary`'s
  // per-activity badge); `queueRef` is the single source of truth `drainQueue`
  // reads/mutates synchronously so a tight retry loop never has to wait for a
  // render to see its own previous iteration's result. `updateQueue` is the
  // ONLY thing allowed to write either — every mutation goes through it, so
  // the two never drift and every mutation is persisted (`saveSyncQueue`)
  // before anything else observes it.
  const [queue, setQueue] = useState<SyncQueue>(() => (isTest ? [] : loadSyncQueue()))
  const queueRef = useRef(queue)

  function updateQueue(updater: (current: SyncQueue) => SyncQueue): void {
    setQueue((current) => {
      const next = updater(current)
      queueRef.current = next
      if (!isTest) saveSyncQueue(next)
      return next
    })
  }

  // Drains every currently-DUE item, one at a time (never in parallel — see
  // `nextItemToAttempt`'s own doc comment for why one-at-a-time is enough
  // here), stopping once nothing is left to attempt right now. `processingRef`
  // makes concurrent calls (mount + interval + online event all firing close
  // together, or a retry click while an interval tick is already mid-drain)
  // a no-op rather than double-sending the same write.
  const processingRef = useRef(false)
  async function drainQueue(): Promise<void> {
    if (isTest || processingRef.current) return
    processingRef.current = true
    try {
      for (;;) {
        const item = nextItemToAttempt(queueRef.current, Date.now())
        if (!item) return
        try {
          await runIntent(item.intent, dateFromLocalDateISO(item.referenceDateISO))
          updateQueue((current) => removeQueueItem(current, item.id))
        } catch (error) {
          // Never thrown into the UI (rule 6) — recorded durably instead, so
          // it survives a reload and keeps retrying with backoff until it
          // clears (Bug C), and stays visible until it does (Bug B).
          updateQueue((current) => markQueueItemFailed(current, item.id, describeSyncError(error), Date.now()))
        }
      }
    } finally {
      processingRef.current = false
    }
  }

  // Wakes the queue: once on mount (a reload with pending/failed writes must
  // retry them without waiting for the interval), on an interval (catches
  // items whose backoff has expired with no other trigger), and the instant
  // connectivity returns. `retrySyncNow` (exposed below) is the same
  // function, for the indicator's explicit "Retry now" action.
  useEffect(() => {
    if (isTest) return
    const wake = () => void drainQueue()
    wake()
    const interval = window.setInterval(wake, SYNC_RETRY_INTERVAL_MS)
    window.addEventListener('online', wake)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('online', wake)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTest])

  // Local-first write + background sync (rule 6). Runs after every action
  // that actually changed state — persisting is unconditional (any change to
  // `activities` must survive a reload), sync intents are whatever
  // `deriveSyncIntents` finds for the action that just ran. Scoped to
  // `viewedDate` (BL-2) — never `now` — because `state.activities` describes
  // whichever day is currently being viewed, which may not be today (rule
  // 12: editing a past day is always allowed).
  //
  // Every intent is enqueued (never fired directly) — Bug B/C means a write
  // is only ever considered done once the queue confirms it, not merely
  // because this effect ran. `drainQueue()` is kicked immediately after
  // enqueueing purely so a healthy connection still feels instant (no need to
  // wait for the interval) — it is not what makes the write durable; the
  // enqueue + persist above already is.
  useEffect(() => {
    const prev = prevStateRef.current
    const action = lastActionRef.current
    prevStateRef.current = state
    lastActionRef.current = null
    if (state === prev) return

    if (!isTest) saveLocalActivities(viewedDate, state.activities)
    if (!isTest && action) {
      const intents = deriveSyncIntents(action, prev, state)
      if (intents.length > 0) {
        const referenceDateISO = localDateISO(viewedDate)
        updateQueue((current) => enqueueIntents(current, intents, referenceDateISO, Date.now(), () => crypto.randomUUID()))
        void drainQueue()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, viewedDate, isTest])

  // Cold-load / date-switch reconciliation: MERGE the server's view of
  // whichever day is being viewed into the local one (rule 8 — bounded to
  // that one day's window, never the full history). `BoardProvider` only ever
  // mounts once the app-level auth gate (`App.tsx`) has already resolved to a
  // real signed-in session (or Supabase isn't configured at all, in which
  // case `apiListScheduledActivities` itself is a no-op) — so there is no
  // sign-in step to do here any more. A failure at any step simply leaves the
  // locally seeded/cached board in place; the app already works from that
  // alone. Re-runs on every `viewedDate` change (BL-2), not just at mount, so
  // navigating the date picker reconciles the newly viewed day the exact same
  // way the initial "today" load always has — and this never depends on the
  // backend being connected (`server` is `null` when Supabase isn't
  // configured, so local-only mode keeps working unchanged).
  //
  // Bug A fix: this used to `hydrate` with the server's response verbatim,
  // wholesale-replacing `state.activities` — a legitimately empty response
  // and "my own unsynced write never reached the server" were indistinguishable,
  // so the latter silently erased local data. `reconcileServerActivities`
  // is what tells them apart, using the durable retry queue as the record of
  // which activities are still unconfirmed — see its own doc comment.
  useEffect(() => {
    if (isTest) return
    let cancelled = false
    ;(async () => {
      const { start, end } = localDayRange(viewedDate)
      const server = await apiListScheduledActivities(start, end)
      if (cancelled || server === null) return
      const merged = reconcileServerActivities(
        latestStateRef.current.activities,
        server,
        pendingActivityIds(queueRef.current),
        pendingDeleteActivityIds(queueRef.current),
      )
      dispatch({ type: 'hydrate', activities: merged })
    })()
    return () => {
      cancelled = true
    }
  }, [isTest, viewedDate])

  // Midnight rollover: `viewedDate` is otherwise only ever changed by an
  // explicit `setViewedDate` call (the date picker) — nothing previously
  // watched the live clock, so a tab left open (backgrounded, not reloaded)
  // across local midnight kept showing/writing yesterday's board forever
  // (`state.activities`, the local-storage key, and the server hydrate range
  // are all scoped to `viewedDate`). This re-checks on every clock tick
  // (`now` changes every `CLOCK_TICK_MS`) and, the instant the device's
  // calendar day changes while the board was following "today" a tick ago,
  // switches to the new day through the exact same path `setViewedDate`
  // already uses for a manual date change (local-first load + the server
  // reconciliation effect above firing for the new date) — never a second,
  // parallel way of loading a day. `shouldRolloverViewedDate` is what keeps
  // this from disturbing a `viewedDate` the user deliberately pinned to some
  // other day (rule 12): see its own doc comment for exactly how.
  const prevNowRef = useRef(now)
  useEffect(() => {
    if (isTest) return
    const prevNow = prevNowRef.current
    prevNowRef.current = now
    if (shouldRolloverViewedDate(viewedDate, prevNow, now)) {
      setViewedDate(now)
    }
    // `viewedDate`/`setViewedDate` are read for their CURRENT render value
    // only at the moment `now` actually changes (see the doc comment above)
    // — depending on them here would re-run this on every date-picker change
    // too, which is unnecessary and would fight the rollover's own
    // `prevNowRef` bookkeeping.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, isTest])

  const nowSlot = useMemo(() => slotIndexFromDate(now), [now])
  const isViewingToday = useMemo(() => isSameLocalDay(viewedDate, now), [viewedDate, now])

  /**
   * Switches the whole board (timeline + editor) to a different calendar
   * day's schedule. Loads that day's local-first data synchronously — same
   * instant feel as every other write in this app (rule 6) — and replaces
   * `state.activities` via the same `hydrate` action the server-reconcile
   * effect above uses, which also clears any staged pick (it belonged to the
   * old day) and any pending removal. The reconciliation effect then fires
   * for the new `viewedDate` on its own, exactly like a fresh mount would.
   */
  function setViewedDate(date: Date): void {
    if (isTest) return
    const normalized = localDayRange(date).start
    setViewedDateState(normalized)
    trackedDispatch({ type: 'hydrate', activities: loadActivitiesForDate(normalized, now) })
  }

  const value = useMemo(
    () => ({
      state,
      dispatch: trackedDispatch,
      now,
      nowSlot,
      viewedDate,
      isViewingToday,
      setViewedDate,
      syncQueue: queue,
      retrySyncNow: () => void drainQueue(),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, now, nowSlot, viewedDate, isViewingToday, queue],
  )

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>
}

export function useBoard(): BoardContextValue {
  const value = useContext(BoardContext)
  if (!value) throw new Error('useBoard must be used inside a <BoardProvider>')
  return value
}
