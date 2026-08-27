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
import { deriveSyncIntents } from './sync'
import { loadLocalActivities, saveLocalActivities } from './localPersistence'
import { isSameLocalDay, localDateISO, localDayRange } from '@/lib/localTime'
import { apiListScheduledActivities } from '@/api/scheduledActivities'
import type { ScheduledActivity } from '@/domain/types'
import { useAuth } from './AuthContext'
import { createBrowserSyncEngine } from './browserSyncEngine'
import { reconcileActivities } from './reconcile'
import type { SyncStatus } from './syncEngine'
import type { PendingEdit } from './syncQueue'

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
   * Always a local-midnight instant (see `localDayRange`).
   */
  viewedDate: Date
  /** True exactly when `viewedDate` is the real current day. */
  isViewingToday: boolean
  /** Switch the whole board (timeline + editor) to a different day's schedule. */
  setViewedDate: (date: Date) => void
  /** Phase 5 — background sync state, for the header's status indicator. */
  syncStatus: SyncStatus
  /** Force an immediate flush attempt (the indicator's "Retry" affordance). */
  retrySync: () => void
  /**
   * Writes still waiting in the offline queue, by activity id. Any read
   * surface that reconciles against the server (Insights) needs these, or it
   * would silently under-report a day logged offline.
   */
  pendingSyncEdits: () => Map<string, PendingEdit>
}

/** Local-only mode's inert status — nothing to sync, nothing to report. */
const IDLE_SYNC_STATUS: SyncStatus = {
  enabled: false,
  online: true,
  pending: 0,
  sending: false,
  retrying: false,
  lastError: null,
  lastSyncedAt: null,
  lastConflictAt: null,
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
  const { user } = useAuth()
  const userId = user?.id ?? null

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

  const trackedDispatch: Dispatch<BoardAction> = (action) => {
    lastActionRef.current = action
    dispatch(action)
  }

  // ---------------------------------------------------------------------
  // Phase 5 — the durable offline write queue.
  //
  // `runSyncIntents` used to fire each intent and forget it: a write made
  // with no connectivity failed once, logged, and was never attempted again.
  // Now every intent goes into a per-user, localStorage-backed queue that
  // retries with backoff, survives the tab closing, and resolves genuine
  // server refusals as rule-7 conflicts instead of losing them.
  // ---------------------------------------------------------------------

  /** Bumped whenever the server should be re-read for the viewed window. */
  const [reconcileToken, setReconcileToken] = useState(0)
  const requestReconcileRef = useRef(() => setReconcileToken((token) => token + 1))
  /** Set when a reconcile was skipped because the user was mid-edit. */
  const missedReconcileRef = useRef(false)

  const engine = useMemo(
    () =>
      createBrowserSyncEngine({
        userId: isTest ? null : userId,
        onReconcileNeeded: () => requestReconcileRef.current(),
      }),
    [userId, isTest],
  )

  useEffect(() => () => engine.dispose(), [engine])

  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => engine.getStatus())
  useEffect(() => engine.subscribe(setSyncStatus), [engine])

  // Connectivity. `online` is what restarts a queue that has been sitting out
  // an outage — the engine also wakes itself on a timer, so this is the fast
  // path, not the only one. `visibilitychange` covers the common real case of
  // a phone that was asleep in a tunnel: no `online` event fires when the tab
  // is restored, but the network is back.
  useEffect(() => {
    if (isTest) return
    const goOnline = () => engine.setOnline(true)
    const goOffline = () => engine.setOnline(false)
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      engine.setOnline(navigator.onLine !== false)
      engine.flush()
    }

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    document.addEventListener('visibilitychange', onVisible)
    engine.flush()

    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [engine, isTest])

  // Local-first write + background sync (rule 6). Runs after every action
  // that actually changed state — persisting is unconditional (any change to
  // `activities` must survive a reload), sync intents are whatever
  // `deriveSyncIntents` finds for the action that just ran. Scoped to
  // `viewedDate` (BL-2) — never `now` — because `state.activities` describes
  // whichever day is currently being viewed, which may not be today (rule
  // 12: editing a past day is always allowed). The day is carried into the
  // queue as a string so a write flushed days later is still anchored to the
  // day it was actually made on.
  useEffect(() => {
    const prev = prevStateRef.current
    const action = lastActionRef.current
    prevStateRef.current = state
    lastActionRef.current = null
    if (state === prev) return

    if (!isTest) saveLocalActivities(viewedDate, state.activities)
    if (!isTest && action) {
      const dayISO = localDateISO(viewedDate)
      for (const intent of deriveSyncIntents(action, prev, state)) {
        engine.enqueue(intent, dayISO)
      }
    }
  }, [state, viewedDate, isTest, engine])

  // Cold-load / date-switch reconciliation: replace the board with the
  // server's authoritative view of whichever day is being viewed (rule 8 —
  // bounded to that one day's window, never the full history). `BoardProvider`
  // only ever mounts once the app-level auth gate (`App.tsx`) has already
  // resolved to a real signed-in session (or Supabase isn't configured at
  // all, in which case `apiListScheduledActivities` itself is a no-op) — so
  // there is no sign-in step to do here any more. A failure at any step
  // simply leaves the locally seeded/cached board in place; the app already
  // works from that alone. Re-runs on every `viewedDate` change (BL-2), not
  // just at mount, so navigating the date picker reconciles the newly viewed
  // day the exact same way the initial "today" load always has — and this
  // never depends on the backend being connected (`server` is `null` when
  // Supabase isn't configured, so local-only mode keeps working unchanged).
  // Phase 5 changed this from "replace the board with whatever the server
  // says" to a real rule-7 reconciliation. The blind swap was correct only
  // while a local write could be assumed already sent; with a durable queue
  // it would silently discard every write still waiting in it (exactly what
  // happens after a reload following an offline session). `reconcileActivities`
  // decides per activity, and hands back the local edits that genuinely lost
  // to a newer edit from another device — those are cancelled and preserved,
  // never dropped on the floor.
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    if (isTest) return
    let cancelled = false
    ;(async () => {
      // Rule 8 — one calendar day's window, never the full history.
      const { start, end } = localDayRange(viewedDate)
      const server = await apiListScheduledActivities(start, end)
      if (cancelled || server === null) return

      const result = reconcileActivities({
        local: stateRef.current.activities,
        server,
        pending: engine.pendingEdits(),
      })

      // Rule 7: the losing edits are cancelled AND kept (queued on their way
      // to `activity_events`) before the board adopts the winner.
      engine.recordSupersededEdits(result.conflicts)

      if (!result.changed) return
      // `hydrate` clears any staged pick, so a background reconcile must not
      // fire while the user is mid-edit — it is retried the moment they
      // finish (see the effect below).
      if (stateRef.current.staging.cardName !== null) {
        missedReconcileRef.current = true
        return
      }
      dispatch({ type: 'hydrate', activities: result.activities })
    })()
    return () => {
      cancelled = true
    }
  }, [isTest, viewedDate, reconcileToken, engine])

  // Picks up a reconcile that was deferred above once the editor is idle again.
  useEffect(() => {
    if (!missedReconcileRef.current || state.staging.cardName !== null) return
    missedReconcileRef.current = false
    requestReconcileRef.current()
  }, [state.staging.cardName])

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
      syncStatus: isTest ? IDLE_SYNC_STATUS : syncStatus,
      retrySync: () => engine.flush(),
      pendingSyncEdits: () => engine.pendingEdits(),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, now, nowSlot, viewedDate, isViewingToday, syncStatus, isTest, engine],
  )

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>
}

export function useBoard(): BoardContextValue {
  const value = useContext(BoardContext)
  if (!value) throw new Error('useBoard must be used inside a <BoardProvider>')
  return value
}
