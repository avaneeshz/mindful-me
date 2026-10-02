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
import { addDaysISO, dayOf, rolloverDay } from '@/domain/dayAxis'
import { slotIndexFromDate } from '@/domain/slots'
import { deriveSyncIntents } from './sync'
import { boardActivitiesFromDates, boardActivitiesToDates, boardDates, storedSyncBatches } from './boardDays'
import { loadLocalActivities, saveLocalActivities } from './localPersistence'
import { reconcileDays } from './reconcileDays'
import { pendingActivityIds, pendingDeleteActivityIds, type SyncQueue } from './syncQueue'
import { useSyncQueue } from './useSyncQueue'
import { dateFromLocalDateISO, localDateISO, localDayRange } from '@/lib/localTime'
import { apiListScheduledActivitiesWithDates } from '@/api/scheduledActivities'
import type { ScheduledActivity } from '@/domain/types'
import { useLiveActivityCatalogSync } from './useLiveActivityCatalogSync'

interface BoardContextValue {
  state: BoardState
  dispatch: Dispatch<BoardAction>
  /** Real device time, re-read on a timer. Never a hardcoded index. */
  now: Date
  /** Slot index containing the real current time. */
  nowSlot: number
  /**
   * The day the board is currently showing — "today" until the user picks a
   * different date from the header's date picker (BL-2). A day runs 06:00 →
   * 06:00 (`domain/dayAxis.ts`): the Oct 2 page shows Oct 2 06:00 through
   * Oct 3 06:00, so its Night row's 12 AM – 6 AM is Oct 3. Always the
   * local-midnight instant of the date the day is named by. While the board
   * is following "today" this ALSO advances on its own at 06:00, even with
   * no reload — see the rollover effect below.
   */
  viewedDate: Date
  /** True exactly when `viewedDate` is the current day (before 06:00, that is still yesterday's date). */
  isViewingToday: boolean
  /** The current day (`dayOf(now)`) at local midnight — what the date picker calls "today". */
  today: Date
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
 * One calendar date's activities — local-first (rule 6), never the network.
 * Demo seed content is a first-ever-run "today" concept only: any OTHER date
 * with nothing in local storage starts genuinely empty, never silently
 * reseeded with the demo schedule.
 */
function loadActivitiesForDate(dateISO: string, now: Date): ScheduledActivity[] {
  const local = loadLocalActivities(dateFromLocalDateISO(dateISO))
  if (local) return local
  return dateISO === localDateISO(now) ? createSeedActivities() : []
}

/**
 * The board for the day named `dayISO`: its three calendar dates (D-1, D,
 * D+1), loaded from this device and laid on the day's one continuous axis
 * — see `state/boardDays.ts`.
 */
function loadBoardForDay(dayISO: string, now: Date): ScheduledActivity[] {
  const byDate = Object.fromEntries(boardDates(dayISO).map((date) => [date, loadActivitiesForDate(date, now)]))
  return boardActivitiesFromDates(dayISO, byDate)
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

  // PICKER-CUSTOM-1 — mounted once, for the board's whole lifetime, so
  // `TileRow`/`LogActivityModal` (via `data/activities.ts`'s live registry)
  // see a signed-in user's own tiles/activities instead of the static
  // catalog, the moment they load. A no-op in every test (`supabaseConfigured`
  // is always false there) and in genuine zero-backend local-only mode — see
  // the hook's own doc comment.
  useLiveActivityCatalogSync()

  // BL-2: the day being VIEWED, independent of the real current instant
  // above. Defaults to the current day — which before 06:00 is still
  // yesterday's date (`dayOf`). Always normalized to local midnight so it
  // can be compared and used as a key the same way everywhere.
  const [viewedDate, setViewedDateState] = useState<Date>(() => dateFromLocalDateISO(dayOf(now)))
  const dayISO = localDateISO(viewedDate)

  // Phase 1 -> Phase 2 persistence boundary: an in-memory-only board used to
  // be seeded fresh on every load. Now the FIRST render prefers whatever was
  // last written to this device (rule 6's "instant local" side of local-
  // first) so a reload never loses today's board while a background fetch
  // reconciles against the server. Only a genuinely first-ever run (nothing
  // in local storage yet, viewing today) falls back to the demo seed content.
  const [state, dispatch] = useReducer(boardReducer, undefined, () => {
    const activities = isTest ? createSeedActivities() : loadBoardForDay(dayISO, now)
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

  // Bug B/C (write-failure-visibility incident) — the durable retry queue,
  // shared with Lumen's data provider so the two interfaces retry, back off
  // and persist identically. See `useSyncQueue`'s own doc comment.
  const { queue, queueRef, enqueue, retryNow } = useSyncQueue(isTest)

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
  // because this effect ran. `enqueue` also kicks a drain purely so a healthy
  // connection still feels instant — it is not what makes the write durable;
  // the enqueue + persist already is.
  useEffect(() => {
    const prev = prevStateRef.current
    const action = lastActionRef.current
    prevStateRef.current = state
    lastActionRef.current = null
    if (state === prev) return

    if (isTest) return
    // The board holds three calendar dates on one axis; each is saved back
    // under its own date, exactly as stored before (rule 2).
    for (const [date, list] of Object.entries(boardActivitiesToDates(dayISO, state.activities))) {
      saveLocalActivities(dateFromLocalDateISO(date), list)
    }
    if (action) {
      // Each write is queued against the date its activity is stored under —
      // an entry logged at 01:30 on the Oct 2 page is an Oct 3 entry.
      const intents = deriveSyncIntents(action, prev, state)
      for (const batch of storedSyncBatches(dayISO, intents, prev.activities, state.activities)) {
        enqueue(batch.intents, batch.date)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, viewedDate, isTest])

  // Cold-load / date-switch reconciliation: MERGE the server's view of
  // whichever day is being viewed into the local one (rule 8 — bounded to
  // that day's three calendar dates, never the full history). `BoardProvider` only ever
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
      const dates = boardDates(dayISO)
      const server = await apiListScheduledActivitiesWithDates(
        dateFromLocalDateISO(dates[0]),
        dateFromLocalDateISO(addDaysISO(dates[dates.length - 1], 1)),
      )
      if (cancelled || server === null) return
      // One pass over all three dates (`reconcileDays`), so an edit that
      // moved an activity across midnight is never duplicated by the
      // server's not-yet-updated copy.
      const merged = reconcileDays(
        dates,
        boardActivitiesToDates(dayISO, latestStateRef.current.activities),
        server,
        pendingActivityIds(queueRef.current),
        pendingDeleteActivityIds(queueRef.current),
      )
      dispatch({ type: 'hydrate', activities: boardActivitiesFromDates(dayISO, merged) })
    })()
    return () => {
      cancelled = true
    }
  }, [isTest, viewedDate])

  // Day rollover: `viewedDate` is otherwise only ever changed by an
  // explicit `setViewedDate` call (the date picker), so a tab left open
  // (backgrounded, not reloaded) across the day boundary would keep
  // showing/writing yesterday's board. The day changes at 06:00, not at
  // midnight (`dayOf`). This re-checks on every clock tick and, the instant
  // the day changes while the board was following "today" a tick ago,
  // switches through the exact same path a manual date change uses
  // (local-first load + the server reconciliation effect above). A day the
  // user deliberately picked is never disturbed (rule 12).
  const prevNowRef = useRef(now)
  useEffect(() => {
    if (isTest) return
    const prevNow = prevNowRef.current
    prevNowRef.current = now
    const nextDay = rolloverDay(dayISO, prevNow, now)
    if (nextDay) setViewedDate(dateFromLocalDateISO(nextDay))
    // `viewedDate`/`setViewedDate` are read for their CURRENT render value
    // only at the moment `now` actually changes (see the doc comment above)
    // — depending on them here would re-run this on every date-picker change
    // too, which is unnecessary and would fight the rollover's own
    // `prevNowRef` bookkeeping.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, isTest])

  const nowSlot = useMemo(() => slotIndexFromDate(now), [now])
  const todayISO = dayOf(now)
  const isViewingToday = dayISO === todayISO
  const today = useMemo(() => dateFromLocalDateISO(todayISO), [todayISO])

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
    trackedDispatch({ type: 'hydrate', activities: loadBoardForDay(localDateISO(normalized), now) })
  }

  const value = useMemo(
    () => ({
      state,
      dispatch: trackedDispatch,
      now,
      nowSlot,
      viewedDate,
      isViewingToday,
      today,
      setViewedDate,
      syncQueue: queue,
      retrySyncNow: retryNow,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, now, nowSlot, viewedDate, isViewingToday, today, queue],
  )

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>
}

export function useBoard(): BoardContextValue {
  const value = useContext(BoardContext)
  if (!value) throw new Error('useBoard must be used inside a <BoardProvider>')
  return value
}
