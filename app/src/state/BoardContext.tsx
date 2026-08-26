import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
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
   * Omitted in the app — real device time is used, exactly as before.
   */
  now?: Date
}

export function BoardProvider({ children, now: fixedNow }: BoardProviderProps) {
  const now = useDeviceClock(fixedNow)

  // NOTE (persistence placeholder): state is in-memory only. There is no async
  // load in this pass, so there is deliberately no loading or error state here.
  // When a backend lands, the initializer below becomes the fetch boundary and
  // this is where loading/error branches belong.
  //
  // The initializer reads the same `now` the rest of the tree sees, rather than
  // minting a second `new Date()` — the two could otherwise straddle a slot
  // boundary and disagree about which slot is current.
  const [state, dispatch] = useReducer(boardReducer, undefined, () =>
    createInitialState(createSeedActivities(), now),
  )

  const nowSlot = useMemo(() => slotIndexFromDate(now), [now])

  const value = useMemo(
    () => ({ state, dispatch, now, nowSlot }),
    [state, now, nowSlot],
  )

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>
}

export function useBoard(): BoardContextValue {
  const value = useContext(BoardContext)
  if (!value) throw new Error('useBoard must be used inside a <BoardProvider>')
  return value
}
