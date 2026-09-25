import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  categories,
  emptyDay,
  newId,
  seedDays,
  seedNotices,
  type DayRecord,
  type Entry,
  type MetricId,
  type Notice,
} from './data'
import { SLOT_MINUTES, currentSlot, todayKey } from './utils'

export type Tab = 'today' | 'calendar' | 'insights' | 'more'

export type Toast = { id: string; message: string; action?: { label: string; run: () => void } }

type Store = {
  tab: Tab
  setTab: (t: Tab) => void
  date: string
  setDate: (d: string) => void
  isToday: boolean
  nowSlot: number
  selectedSlot: number
  setSelectedSlot: (s: number) => void
  days: Record<string, DayRecord>
  day: DayRecord
  slotEntries: Entry[]
  slotUsed: (slot: number) => number
  logActivity: (input: { categoryId: string; activityId: string; minutes: number; slot?: number }) => void
  removeEntry: (id: string) => void
  setMetric: (id: MetricId, value: number) => void
  setRhythm: (key: 'wake' | 'windDown', minutes: number) => void
  hiddenCategories: string[]
  toggleCategory: (id: string) => void
  hiddenMetrics: MetricId[]
  toggleMetric: (id: MetricId) => void
  healthSync: 'off' | 'syncing' | 'on'
  toggleHealthSync: () => void
  notices: Notice[]
  markNoticesRead: () => void
  toasts: Toast[]
  toast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void
  quickLogOpen: boolean
  setQuickLogOpen: (open: boolean) => void
}

const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<Tab>('today')
  const [date, setDateState] = useState(todayKey)
  const [nowSlot, setNowSlot] = useState(currentSlot)
  const [selectedSlot, setSelectedSlot] = useState(currentSlot)
  const [days, setDays] = useState(seedDays)
  const [hiddenCategories, setHidden] = useState<string[]>([])
  const [hiddenMetrics, setHiddenMetrics] = useState<MetricId[]>([])
  const [healthSync, setHealthSync] = useState<'off' | 'syncing' | 'on'>('off')
  const [notices, setNotices] = useState(seedNotices)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [quickLogOpen, setQuickLogOpen] = useState(false)
  const syncTimer = useRef<number | undefined>(undefined)

  // Keep "now" honest while the tab is open.
  useEffect(() => {
    const t = window.setInterval(() => setNowSlot(currentSlot()), 30_000)
    return () => window.clearInterval(t)
  }, [])

  const isToday = date === todayKey()
  const day = days[date] ?? emptyDay()

  const setDate = useCallback((d: string) => {
    setDateState(d)
    setSelectedSlot(d === todayKey() ? currentSlot() : 18)
  }, [])

  const updateDay = useCallback(
    (fn: (d: DayRecord) => DayRecord) => setDays((all) => ({ ...all, [date]: fn(all[date] ?? emptyDay()) })),
    [date],
  )

  const slotUsed = useCallback(
    (slot: number) => day.entries.filter((e) => e.slot === slot).reduce((sum, e) => sum + e.minutes, 0),
    [day],
  )

  const dismissToast = useCallback((id: string) => setToasts((ts) => ts.filter((t) => t.id !== id)), [])

  const toast = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = newId()
      setToasts((ts) => [...ts.slice(-2), { ...t, id }])
      window.setTimeout(() => dismissToast(id), 4200)
    },
    [dismissToast],
  )

  const removeEntry = useCallback(
    (id: string) => updateDay((d) => ({ ...d, entries: d.entries.filter((e) => e.id !== id) })),
    [updateDay],
  )

  const logActivity = useCallback<Store['logActivity']>(
    ({ categoryId, activityId, minutes, slot }) => {
      const target = slot ?? selectedSlot
      const room = SLOT_MINUTES - slotUsed(target)
      const amount = Math.min(minutes, room)
      if (amount <= 0) {
        toast({ message: 'This slot is already full' })
        return
      }
      const entry: Entry = { id: newId(), slot: target, categoryId, activityId, minutes: amount }
      updateDay((d) => ({ ...d, entries: [...d.entries, entry] }))
      const label = categories.find((c) => c.id === categoryId)?.activities.find((a) => a.id === activityId)?.label
      toast({
        message: `Logged ${amount} min · ${label ?? 'Activity'}`,
        action: { label: 'Undo', run: () => removeEntry(entry.id) },
      })
    },
    [selectedSlot, slotUsed, updateDay, toast, removeEntry],
  )

  const setMetric = useCallback(
    (id: MetricId, value: number) => updateDay((d) => ({ ...d, metrics: { ...d.metrics, [id]: Math.max(0, value) } })),
    [updateDay],
  )

  const setRhythm = useCallback(
    (key: 'wake' | 'windDown', minutes: number) => updateDay((d) => ({ ...d, [key]: minutes })),
    [updateDay],
  )

  const toggleCategory = useCallback(
    (id: string) => setHidden((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id])),
    [],
  )
  const toggleMetric = useCallback(
    (id: MetricId) => setHiddenMetrics((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id])),
    [],
  )

  const toggleHealthSync = useCallback(() => {
    window.clearTimeout(syncTimer.current)
    if (healthSync !== 'off') {
      setHealthSync('off')
      toast({ message: 'Health sync paused' })
      return
    }
    setHealthSync('syncing')
    syncTimer.current = window.setTimeout(() => {
      setHealthSync('on')
      setDays((all) => {
        const d = all[todayKey()]
        if (!d) return all
        return { ...all, [todayKey()]: { ...d, metrics: { ...d.metrics, steps: d.metrics.steps + 1180 } } }
      })
      toast({ message: 'Synced with Health · steps updated' })
    }, 1400)
  }, [healthSync, toast])

  const markNoticesRead = useCallback(() => setNotices((ns) => ns.map((n) => ({ ...n, unread: false }))), [])

  const slotEntries = useMemo(() => day.entries.filter((e) => e.slot === selectedSlot), [day, selectedSlot])

  const value: Store = {
    tab,
    setTab,
    date,
    setDate,
    isToday,
    nowSlot,
    selectedSlot,
    setSelectedSlot,
    days,
    day,
    slotEntries,
    slotUsed,
    logActivity,
    removeEntry,
    setMetric,
    setRhythm,
    hiddenCategories,
    toggleCategory,
    hiddenMetrics,
    toggleMetric,
    healthSync,
    toggleHealthSync,
    notices,
    markNoticesRead,
    toasts,
    toast,
    dismissToast,
    quickLogOpen,
    setQuickLogOpen,
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}
