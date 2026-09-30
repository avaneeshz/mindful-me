import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { isCardLocked } from '@/domain/disappear'
import { nextFreeStart, type ActivityRef, type CommitContext } from '@/domain/scheduling'
import type { ActivityCard, ScheduledActivity } from '@/domain/types'
import { useDismissedActivities } from '@/state/dismissedActivities'
import { setDisplayButtonsRegistry } from '@/domain/displayButtons'
import { toDisplayButtonLike } from '@/domain/headerButtons'
import { setNoteButtonsRegistry, setNoteButtonTypesRegistry } from '@/domain/notes'
import { usePickerData } from '@/state/PickerDataContext'
import { useHeaderButtons, type UseHeaderButtonsResult } from '@/state/useHeaderButtons'
import { useLiveActivityCatalogSync } from '@/state/useLiveActivityCatalogSync'
import { supabaseConfigured } from '@/lib/supabaseClient'
import {
  activitiesWithin,
  isInLumenDay,
  loggedMinutes,
  LUMEN_DAY_END,
  LUMEN_DAY_START,
  lumenDayOf,
  minutesByKey,
  nowOnAxis,
  schedulingList,
  toAxis,
  type AxisActivity,
} from '@/lumen/domain/lumenDay'
import type { PlanFailure } from '@/lumen/domain/lumenWrites'
import {
  buildLumenTiles,
  catalogSource,
  loadTileColorOverrides,
  saveTileColorOverrides,
  type LumenTile,
} from '@/lumen/data/catalog'
import { useLumenDays, type LumenDays } from '@/lumen/data/useLumenDays'
import type { LogTarget } from '@/lumen/components/log/log-sheet'
import { formatDuration, fromKey } from './utils'

export type Tab = 'today' | 'calendar' | 'insights' | 'more'

/** Which page of Settings is showing: the list itself, or one of its editors. */
export type SettingsView = 'root' | 'library' | 'buttons' | 'devices' | 'devices-add' | 'health-data'

export type Toast = { id: string; message: string; action?: { label: string; run: () => void } }

/** One half-hour on the strips. */
export const SLOT_MINUTES = 30

/** Where the selection sits when opening a day other than today: 9 AM. */
const DEFAULT_SLOT = 9 * 60

type Store = {
  tab: Tab
  setTab: (t: Tab) => void
  settingsView: SettingsView
  /** Opens Settings at one of its pages. */
  openSettings: (view: SettingsView) => void

  /** The viewed Lumen day, `YYYY-MM-DD` — it runs 06:00 on this date to 06:00 the next. */
  day: string
  setDay: (d: string) => void
  /** The Lumen day it is right now (before 6 AM still counts as yesterday). */
  today: string
  isToday: boolean
  now: Date
  /** Now on the viewed day's axis, or null when viewing another day. */
  nowMinute: number | null

  /** The selected half-hour's start, on the axis (360 → 1770). */
  selectedSlot: number
  setSelectedSlot: (minute: number) => void
  /** The half-hour containing now, on today's axis. */
  nowSlot: number

  /** The person's own tiles, coloured, in on-screen order, hidden ones left out. */
  tiles: LumenTile[]
  allTiles: LumenTile[]
  /** Still waiting on the person's own catalog (signed in, first load). */
  catalogLoading: boolean
  tileOf: (activity: Pick<ScheduledActivity, 'name'>) => LumenTile | undefined

  /** The viewed Lumen day's activities, in time order, on its axis. */
  axis: AxisActivity[]
  slotItems: AxisActivity[]
  /** The first free minute inside the half-hour starting at `slot`, or null when it's full. */
  freeStartIn: (slot: number) => number | null
  /** The first free minute at or after `minute`, wherever it falls — where a quick log starts. */
  nextFreeFrom: (minute: number) => number
  minutesByTile: Map<string, number>
  totalLogged: number
  /** Classic's disappear rule over the Lumen day: done once logged `limit` times, or marked done by hand. */
  isCardDone: (card: ActivityCard) => boolean
  toggleCardDone: (name: string) => void

  data: LumenDays
  logActivity: (input: {
    activity: ActivityRef
    start: number
    durationMinutes: number
    context?: CommitContext
  }) => boolean
  updateActivity: (
    id: string,
    changes: { start?: number; durationMinutes?: number; path?: string[]; context?: CommitContext },
  ) => boolean
  removeActivity: (id: string) => void

  /** The person's own header buttons (metrics, quick logs, checklists, notes) — the same list Classic's header shows. */
  headerButtons: UseHeaderButtonsResult

  /** Per-device: which tiles are hidden on Today, and any colours the person picked. */
  hiddenTiles: string[]
  toggleTile: (id: string) => void
  setTileColor: (tileId: string, colorId: string) => void

  /** What the log sheet is open for: a new entry or an edit. Null when closed. */
  logTarget: LogTarget | null
  openLog: (target: LogTarget | null) => void
  /** Open the sheet for a new entry at the first free minute of the selected half-hour (the "+" button and the L key). */
  quickLog: () => void

  toasts: Toast[]
  toast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void
}

const StoreContext = createContext<Store | null>(null)

const HIDDEN_TILES_KEY = 'mindful-me:lumen:hidden-tiles'

function loadHiddenTiles(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(HIDDEN_TILES_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function saveHiddenTiles(ids: string[]) {
  try {
    window.localStorage.setItem(HIDDEN_TILES_KEY, JSON.stringify(ids))
  } catch {
    // In-memory state is still correct; only cross-reload durability is lost.
  }
}

/** Real device time, re-read every 30 s. */
function useClock(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

const slotOf = (minute: number) => Math.floor(minute / SLOT_MINUTES) * SLOT_MINUTES

/** A plain-language reason a placement didn't fit. */
export function describePlanFailure(failure: PlanFailure): string {
  switch (failure.reason) {
    case 'occupied':
      return 'That time is already taken'
    case 'too-long':
      return failure.maxDuration > 0
        ? `Only ${formatDuration(failure.maxDuration)} free there — shorten it or pick another time`
        : 'That time is already taken'
    case 'outside-day':
      return 'Pick a start between 6 AM and 6 AM the next morning'
    case 'missing':
      return 'That entry no longer exists'
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  // The person's own tiles and activities, through the same registry
  // Classic reads (`data/activities.ts`), fed by the same shared picker data.
  useLiveActivityCatalogSync()
  const picker = usePickerData()

  // The person's own header buttons. Their per-button config is read through
  // small runtime registries (configured note fields on an activity, note
  // types, targets), set during render exactly as Classic's HeaderBar does,
  // so both interfaces resolve every button identically.
  const headerButtons = useHeaderButtons()
  const allHeaderButtons = [...headerButtons.visible, ...headerButtons.hidden]
  setDisplayButtonsRegistry(
    allHeaderButtons.filter((b) => b.category === 'activity' || b.category === 'day_value').map(toDisplayButtonLike),
  )
  const noteButtonConfigs = allHeaderButtons.filter((b) => b.category === 'notes')
  setNoteButtonsRegistry(noteButtonConfigs.map((b) => ({ key: b.key ?? b.id, label: b.label })))
  setNoteButtonTypesRegistry(Object.fromEntries(noteButtonConfigs.map((b) => [b.key ?? b.id, b.noteTypes])))

  const now = useClock()
  const today = lumenDayOf(now)
  const [tab, setTabState] = useState<Tab>('today')
  const [settingsView, setSettingsView] = useState<SettingsView>('root')
  const setTab = useCallback((t: Tab) => {
    setTabState(t)
    setSettingsView('root')
  }, [])
  const openSettings = useCallback((view: SettingsView) => {
    setTabState('more')
    setSettingsView(view)
  }, [])
  const [day, setDayState] = useState(today)
  const isToday = day === today

  const nowAxis = nowOnAxis(day, now)
  const nowMinute = isToday && isInLumenDay(nowAxis) ? nowAxis : null
  const nowSlot = slotOf(nowOnAxis(today, now))
  const [selectedSlot, setSelectedSlotState] = useState(() => slotOf(nowOnAxis(today, now)))

  // Midnight-of-the-Lumen-day rollover: at 06:00 a tab left open while
  // following today moves on to the new day by itself; a day the person
  // deliberately opened stays put (rule 12).
  const prevTodayRef = useRef(today)
  useEffect(() => {
    const prev = prevTodayRef.current
    prevTodayRef.current = today
    if (prev !== today && day === prev) {
      setDayState(today)
      setSelectedSlotState(slotOf(nowOnAxis(today, new Date())))
    }
  }, [today, day])

  const setDay = useCallback(
    (d: string) => {
      setDayState(d)
      setSelectedSlotState(d === lumenDayOf(new Date()) ? slotOf(nowOnAxis(d, new Date())) : DEFAULT_SLOT)
    },
    [],
  )
  const setSelectedSlot = useCallback((minute: number) => {
    setSelectedSlotState(Math.min(LUMEN_DAY_END - SLOT_MINUTES, Math.max(LUMEN_DAY_START, slotOf(minute))))
  }, [])

  const data = useLumenDays(day)

  // The person's own tiles and activity trees — see `catalogSource` for why
  // this is derived here rather than read back from the shared registry.
  const [tileColors, setTileColors] = useState(loadTileColorOverrides)
  const [hiddenTiles, setHiddenTiles] = useState(loadHiddenTiles)
  const catalog = useMemo(
    () =>
      catalogSource({
        configured: supabaseConfigured,
        tiles: picker.tiles.tiles,
        tilesReady: picker.tiles.status === 'ready',
        activities: picker.activities.activities,
        activitiesReady: picker.activities.status === 'ready',
      }),
    [picker.tiles.tiles, picker.tiles.status, picker.activities.activities, picker.activities.status],
  )
  const allTiles = useMemo(
    () =>
      buildLumenTiles(catalog.categories, catalog.order, (id) => catalog.cards.filter((c) => c.categoryId === id), tileColors),
    [catalog, tileColors],
  )
  const tiles = useMemo(() => allTiles.filter((t) => !hiddenTiles.includes(t.id)), [allTiles, hiddenTiles])
  const tileById = useMemo(() => new Map(allTiles.map((t) => [t.id, t])), [allTiles])
  const cardByName = useMemo(() => new Map(catalog.cards.map((c) => [c.name, c])), [catalog])
  const tileOf = useCallback(
    (activity: Pick<ScheduledActivity, 'name'>) => {
      const card = activity.name ? cardByName.get(activity.name) : undefined
      return card ? tileById.get(card.categoryId) : undefined
    },
    [cardByName, tileById],
  )
  const catalogLoading = picker.tiles.status === 'loading' || picker.activities.status === 'loading'

  const axis = useMemo(() => toAxis(day, data.byDate), [day, data.byDate])
  const slotItems = useMemo(() => activitiesWithin(axis, selectedSlot, selectedSlot + SLOT_MINUTES), [axis, selectedSlot])
  const freeStartIn = useCallback(
    (slot: number) => {
      const start = nextFreeStart(schedulingList(axis), slot)
      return start < slot + SLOT_MINUTES ? start : null
    },
    [axis],
  )
  const nextFreeFrom = useCallback((minute: number) => nextFreeStart(schedulingList(axis), minute), [axis])
  const minutesByTile = useMemo(() => minutesByKey(axis, (a) => tileOf(a)?.id ?? 'other'), [axis, tileOf])
  const totalLogged = useMemo(() => loggedMinutes(axis), [axis])

  // "Done for the day" — the same rule and the same per-date store Classic
  // uses, counted over entries that START inside this Lumen day.
  const dayDate = useMemo(() => fromKey(day), [day])
  const { dismissed, toggleDismissed } = useDismissedActivities(dayDate)
  const startedToday = useMemo(
    () => axis.filter((i) => i.start >= LUMEN_DAY_START && i.start < LUMEN_DAY_END).map((i) => i.activity),
    [axis],
  )
  const isCardDone = useCallback((card: ActivityCard) => isCardLocked(card, startedToday, dismissed), [startedToday, dismissed])

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([])
  const dismissToast = useCallback((id: string) => setToasts((ts) => ts.filter((t) => t.id !== id)), [])
  const toast = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = crypto.randomUUID()
      setToasts((ts) => [...ts.slice(-2), { ...t, id }])
      window.setTimeout(() => dismissToast(id), t.action ? 6000 : 4200)
    },
    [dismissToast],
  )

  const removeActivity = useCallback(
    (id: string) => {
      const removed = data.remove(id)
      if (!removed) return
      toast({
        message: `Removed ${removed.activity.name ?? 'entry'}`,
        action: { label: 'Undo', run: () => data.restore(removed) },
      })
    },
    [data, toast],
  )

  const logActivity = useCallback<Store['logActivity']>(
    (input) => {
      const result = data.create(input)
      if (!result.ok) {
        toast({ message: describePlanFailure(result) })
        return false
      }
      toast({
        message: `Logged ${formatDuration(result.activity.durationMinutes)} · ${result.activity.name}`,
        action: { label: 'Undo', run: () => data.remove(result.activity.id) },
      })
      return true
    },
    [data, toast],
  )

  const updateActivity = useCallback<Store['updateActivity']>(
    (id, changes) => {
      const result = data.update(id, changes)
      if (!result.ok) {
        toast({ message: describePlanFailure(result) })
        return false
      }
      return true
    },
    [data, toast],
  )

  const toggleTile = useCallback((id: string) => {
    setHiddenTiles((h) => {
      const next = h.includes(id) ? h.filter((x) => x !== id) : [...h, id]
      saveHiddenTiles(next)
      return next
    })
  }, [])

  const setTileColor = useCallback((tileId: string, colorId: string) => {
    setTileColors((current) => {
      const next = { ...current, [tileId]: colorId }
      saveTileColorOverrides(next)
      return next
    })
  }, [])

  const [logTarget, setLogTarget] = useState<LogTarget | null>(null)
  const quickLog = useCallback(() => {
    setLogTarget({ kind: 'new', tileId: null, start: nextFreeFrom(selectedSlot) })
  }, [nextFreeFrom, selectedSlot])

  const value: Store = {
    tab,
    setTab,
    settingsView,
    openSettings,
    day,
    setDay,
    today,
    isToday,
    now,
    nowMinute,
    selectedSlot,
    setSelectedSlot,
    nowSlot,
    tiles,
    allTiles,
    catalogLoading,
    tileOf,
    axis,
    slotItems,
    freeStartIn,
    nextFreeFrom,
    minutesByTile,
    totalLogged,
    isCardDone,
    toggleCardDone: toggleDismissed,
    data,
    logActivity,
    updateActivity,
    removeActivity,
    headerButtons,
    hiddenTiles,
    toggleTile,
    setTileColor,
    logTarget,
    openLog: setLogTarget,
    quickLog,
    toasts,
    toast,
    dismissToast,
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}
