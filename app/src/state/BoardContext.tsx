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
import { deriveSyncIntents, runSyncIntents } from './sync'
import { loadLocalActivities, saveLocalActivities } from './localPersistence'
import { localDayRange } from '@/lib/localTime'
import { apiListScheduledActivities } from '@/api/scheduledActivities'

interface BoardContextValue {
  state: BoardState
  dispatch: Dispatch<BoardAction>
  /** Real device time, re-read on a timer. Never a hardcoded index. */
  now: Date
  /** Slot index containing the real current time. */
  nowSlot: number
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

  // Phase 1 -> Phase 2 persistence boundary: an in-memory-only board used to
  // be seeded fresh on every load. Now the FIRST render prefers whatever was
  // last written to this device (rule 6's "instant local" side of local-
  // first) so a reload never loses today's board while a background fetch
  // reconciles against the server. Only a genuinely first-ever run (nothing
  // in local storage yet) falls back to the demo seed content.
  const [state, dispatch] = useReducer(boardReducer, undefined, () => {
    const local = isTest ? null : loadLocalActivities(now)
    return createInitialState(local ?? createSeedActivities(), now)
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

  // Local-first write + background sync (rule 6). Runs after every action
  // that actually changed state — persisting is unconditional (any change to
  // `activities` must survive a reload), sync intents are whatever
  // `deriveSyncIntents` finds for the action that just ran.
  useEffect(() => {
    const prev = prevStateRef.current
    const action = lastActionRef.current
    prevStateRef.current = state
    lastActionRef.current = null
    if (state === prev) return

    if (!isTest) saveLocalActivities(now, state.activities)
    if (!isTest && action) {
      const intents = deriveSyncIntents(action, prev, state)
      if (intents.length > 0) runSyncIntents(intents, now)
    }
  }, [state, now, isTest])

  // Cold-load reconciliation: replace the board with the server's
  // authoritative view of today (rule 8 — bounded to today's window, never
  // the full history). `BoardProvider` only ever mounts once the app-level
  // auth gate (`App.tsx`) has already resolved to a real signed-in session
  // (or Supabase isn't configured at all, in which case `apiListScheduledActivities`
  // itself is a no-op) — so there is no sign-in step to do here any more. A
  // failure at any step simply leaves the locally seeded/cached board in
  // place; the app already works from that alone.
  useEffect(() => {
    if (isTest) return
    let cancelled = false
    ;(async () => {
      const { start, end } = localDayRange(now)
      const server = await apiListScheduledActivities(start, end)
      if (!cancelled && server !== null) {
        dispatch({ type: 'hydrate', activities: server })
      }
    })()
    return () => {
      cancelled = true
    }
    // Intentionally runs once per mount, not on every clock tick — refetching
    // "today" every 30s would defeat the point of an instant local read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTest])

  const nowSlot = useMemo(() => slotIndexFromDate(now), [now])

  const value = useMemo(
    () => ({ state, dispatch: trackedDispatch, now, nowSlot }),
    [state, now, nowSlot],
  )

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>
}

export function useBoard(): BoardContextValue {
  const value = useContext(BoardContext)
  if (!value) throw new Error('useBoard must be used inside a <BoardProvider>')
  return value
}
