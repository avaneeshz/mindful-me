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
import {
  dayOffsetFromPage,
  overlapsWindow,
  toAxis,
  WINDOW_END,
  WINDOW_START,
  windowBoundsFor,
  windowFromDays,
  type WindowDayOffset,
} from '@/domain/windowAxis'
import { commitSchedule, validateSchedule, type CandidateSchedule } from '@/domain/scheduling'
import { slotIndexFromDate } from '@/domain/slots'
import { deriveSyncIntents } from './sync'
import { loadLocalActivities, loadLocalDays, saveLocalActivities, saveLocalWindow } from './localPersistence'
import { reconcileServerActivities } from './reconcileServerActivities'
import { pendingActivityIds, pendingDeleteActivityIds, type SyncQueue } from './syncQueue'
import { useSyncQueue } from './useSyncQueue'
import {
  dateFromLocalMinutes,
  isSameLocalDay,
  localDateISO,
  logicalToday,
  shouldRolloverViewedDate,
} from '@/lib/localTime'
import { apiListScheduledActivities } from '@/api/scheduledActivities'
import type { FieldSelections, ScheduledActivity } from '@/domain/types'
import { useLiveActivityCatalogSync } from './useLiveActivityCatalogSync'

/** One quick-log stretch, anchored to the calendar day it STARTS on (rule 2) — which may not be the day on screen. */
export interface QuickLogInput {
  cardName: string
  /** The day the stretch starts on. Any time of day is fine; only the calendar day is read. */
  startDate: Date
  /** Minutes since local midnight of `startDate`; `startMinutes + durationMinutes` may run past 1440. */
  startMinutes: number
  durationMinutes: number
  path?: string[]
  notes?: string | null
  fieldSelections?: FieldSelections
  dreamsNote?: string | null
}

export type QuickLogResult = { ok: true } | { ok: false; reason: 'occupied' | 'too-long' }

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
   * Logs a quick-log stretch on whichever day it starts, validated against
   * that day, the spill-in from the day before and the day after (rule 1
   * across midnight). A stretch on the viewed day goes through the reducer
   * like any other write; one on a different day is written straight to that
   * day's local store and the sync queue (rule 6), without touching the board
   * on screen. Returns a conflict instead of writing when it doesn't fit.
   */
  logQuickLog: (input: QuickLogInput) => QuickLogResult
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
 * The activities to show on the page for `date` — a 06:00 -> 06:00 window built
 * from the three calendar days it touches (`domain/windowAxis.ts`) — local-first
 * (rule 6), never the network. Demo seed content is a first-ever-run "today"
 * concept only: any OTHER date with nothing in local storage starts genuinely
 * empty, never silently reseeded with the demo schedule.
 */
function loadWindowForDate(date: Date, now: Date): ScheduledActivity[] {
  const days = loadLocalDays(date)
  const dayItself = days[0] ?? (isSameLocalDay(date, logicalToday(now)) ? createSeedActivities() : [])
  return windowFromDays({ ...days, 0: dayItself } as Partial<Record<WindowDayOffset, ScheduledActivity[]>>)
}

/** A day offset from `date`, as a local-midnight `Date`. */
function addLocalDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

/**
 * Everything stored for the days around `date` that a new stretch starting on
 * it could run into, on `date`'s axis — the two days either side, whole, not
 * just what overlaps the page, since a stretch may reach past the window.
 */
function localNeighbourhood(date: Date, exceptIds: ReadonlySet<string>): ScheduledActivity[] {
  const result: ScheduledActivity[] = []
  for (let offset = -2; offset <= 2; offset += 1) {
    for (const activity of loadLocalActivities(addLocalDays(date, offset)) ?? []) {
      if (!exceptIds.has(activity.id)) result.push(toAxis(activity, offset))
    }
  }
  return result
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
  // above. Defaults to today, exactly as the board always has — see
  // `isViewingToday`/`setViewedDate` below for how navigating away from it
  // works. Always normalized to local midnight so it can be compared and
  // used as a local-storage/fetch-range key the same way everywhere.
  const [viewedDate, setViewedDateState] = useState<Date>(() => logicalToday(now))

  // Phase 1 -> Phase 2 persistence boundary: an in-memory-only board used to
  // be seeded fresh on every load. Now the FIRST render prefers whatever was
  // last written to this device (rule 6's "instant local" side of local-
  // first) so a reload never loses today's board while a background fetch
  // reconciles against the server. Only a genuinely first-ever run (nothing
  // in local storage yet, viewing today) falls back to the demo seed content.
  const [state, dispatch] = useReducer(boardReducer, undefined, () => {
    const activities = isTest ? createSeedActivities() : loadWindowForDate(viewedDate, now)
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

    if (!isTest) saveLocalWindow(viewedDate, state.activities)
    if (!isTest && action) {
      enqueue(deriveSyncIntents(action, prev, state), localDateISO(viewedDate))
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
      // One bounded request for the page's whole 06:00 -> 06:00 window (rule 8).
      // Starting a hair early keeps a flag marker sitting exactly on 06:00 in the
      // result — the server's overlap test is strict at the open edge.
      const start = new Date(dateFromLocalMinutes(viewedDate, WINDOW_START).getTime() - 1)
      const end = dateFromLocalMinutes(viewedDate, WINDOW_END)
      const serverRows = await apiListScheduledActivities(start, end, viewedDate)
      if (cancelled || serverRows === null) return
      const server = serverRows.filter(overlapsWindow)
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
      setViewedDate(logicalToday(now))
    }
    // `viewedDate`/`setViewedDate` are read for their CURRENT render value
    // only at the moment `now` actually changes (see the doc comment above)
    // — depending on them here would re-run this on every date-picker change
    // too, which is unnecessary and would fight the rollover's own
    // `prevNowRef` bookkeeping.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, isTest])

  const nowSlot = useMemo(() => slotIndexFromDate(now), [now])
  const isViewingToday = useMemo(() => isSameLocalDay(viewedDate, logicalToday(now)), [viewedDate, now])

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
    const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    setViewedDateState(normalized)
    trackedDispatch({ type: 'hydrate', activities: loadWindowForDate(normalized, now) })
  }

  function logQuickLog(input: QuickLogInput): QuickLogResult {
    const startDay = new Date(input.startDate.getFullYear(), input.startDate.getMonth(), input.startDate.getDate())
    const offset = dayOffsetFromPage(localDateISO(viewedDate), localDateISO(startDay))
    if (offset === null) return { ok: false, reason: 'occupied' }

    // The stretch on the page's axis, wherever it starts. Anything it could run
    // into — on the page or on the days around it — must be checked, so the
    // page's own list is joined with what is stored locally for those days.
    const startMinutes = input.startMinutes + offset * 1440
    const candidate: CandidateSchedule = {
      id: null,
      activity: { name: input.cardName, path: input.path ?? [] },
      startMinutes,
      durationMinutes: input.durationMinutes,
    }
    const onPageIds = new Set(state.activities.map((a) => a.id))
    const universe = [...state.activities, ...localNeighbourhood(viewedDate, onPageIds)]
    const validation = validateSchedule(candidate, universe, windowBoundsFor(candidate))
    if (!validation.ok) return { ok: false, reason: validation.reason }

    // Overlaps the page: it goes through the reducer like any write, and the
    // persist effect files it under the day it started on.
    if (overlapsWindow(candidate)) {
      trackedDispatch({
        type: 'quickLogActivity',
        cardName: input.cardName,
        startMinutes,
        durationMinutes: input.durationMinutes,
        path: input.path,
        notes: input.notes,
        fieldSelections: input.fieldSelections,
        dreamsNote: input.dreamsNote,
      })
      return { ok: true }
    }

    // Entirely on another day's page: write to that day's own store and the
    // sync queue (rule 6), leaving the page on screen untouched.
    const committed = commitSchedule(
      { ...candidate, startMinutes: input.startMinutes },
      {
        notes: input.notes?.trim() ? input.notes : null,
        fieldSelections: input.fieldSelections ?? {},
        dreamsNote: input.dreamsNote?.trim() ? input.dreamsNote : null,
      },
    )
    saveLocalActivities(startDay, [...(loadLocalActivities(startDay) ?? []), committed])
    enqueue([{ kind: 'create', activity: committed }], localDateISO(startDay))
    return { ok: true }
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
      logQuickLog,
      syncQueue: queue,
      retrySyncNow: retryNow,
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
