import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  apiCreateImportantDay,
  apiDeleteImportantDay,
  apiListImportantDays,
  apiListIndiaHolidays,
  apiUpdateImportantDay,
} from '@/api/calendarDays'
import {
  buildCalendarMarkers,
  IMPORTANT_DAY_PROBLEM_TEXT,
  validateImportantDay,
  type CalendarMarker,
  type Holiday,
  type ImportantDay,
} from '@/domain/importantDays'
import { generateId } from '@/domain/scheduling'
import { supabaseConfigured } from '@/lib/supabaseClient'

/** Holidays per year, kept for the session — they rarely change and the picker opens often. */
const holidayCache = new Map<number, Holiday[]>()

export type MarkerStatus = 'idle' | 'loading' | 'ready' | 'error'

type WriteResult = { ok: true } | { ok: false; message: string }

export interface UseCalendarMarkersResult {
  /** Markers per `YYYY-MM-DD` for the visible years. */
  markers: Map<string, CalendarMarker[]>
  holidaysStatus: MarkerStatus
  importantDaysStatus: MarkerStatus
  /** Needs an account: personal days are stored on the server and sync to every device. */
  canEditImportantDays: boolean
  importantDays: ImportantDay[]
  addImportantDay: (input: Omit<ImportantDay, 'id'>) => Promise<WriteResult>
  updateImportantDay: (day: ImportantDay) => Promise<WriteResult>
  removeImportantDay: (id: string) => Promise<WriteResult>
}

const OFFLINE = 'Couldn’t save right now. Check your connection and try again.'

/**
 * Everything the date picker paints inside its cells: Indian holidays for
 * the visible year(s) and the user's own yearly important days. Personal
 * days are written to the server before they show, so every device agrees.
 */
export function useCalendarMarkers(years: readonly number[]): UseCalendarMarkersResult {
  const yearsKey = [...new Set(years)].sort().join(',')
  const [holidays, setHolidays] = useState<Map<number, Holiday[]>>(() => new Map(holidayCache))
  const [holidaysStatus, setHolidaysStatus] = useState<MarkerStatus>('idle')
  const [importantDays, setImportantDays] = useState<ImportantDay[]>([])
  const [importantDaysStatus, setImportantDaysStatus] = useState<MarkerStatus>('idle')

  useEffect(() => {
    if (!supabaseConfigured) return
    const missing = yearsKey
      .split(',')
      .map(Number)
      .filter((y) => !holidayCache.has(y))
    if (missing.length === 0) {
      setHolidaysStatus('ready')
      return
    }
    let cancelled = false
    setHolidaysStatus('loading')
    void Promise.all(missing.map((y) => apiListIndiaHolidays(y).then((list) => [y, list] as const))).then((results) => {
      if (cancelled) return
      let failed = false
      for (const [y, list] of results) {
        if (list) holidayCache.set(y, list)
        else failed = true
      }
      setHolidays(new Map(holidayCache))
      setHolidaysStatus(failed ? 'error' : 'ready')
    })
    return () => {
      cancelled = true
    }
  }, [yearsKey])

  useEffect(() => {
    if (!supabaseConfigured) return
    let cancelled = false
    setImportantDaysStatus('loading')
    void apiListImportantDays().then((list) => {
      if (cancelled) return
      if (list) setImportantDays(list)
      setImportantDaysStatus(list ? 'ready' : 'error')
    })
    return () => {
      cancelled = true
    }
  }, [])

  const markers = useMemo(() => {
    const ys = yearsKey.split(',').map(Number)
    return buildCalendarMarkers(
      ys.flatMap((y) => holidays.get(y) ?? []),
      importantDays,
      ys,
    )
  }, [holidays, importantDays, yearsKey])

  const addImportantDay = useCallback(async (input: Omit<ImportantDay, 'id'>): Promise<WriteResult> => {
    const problem = validateImportantDay(input)
    if (problem) return { ok: false, message: IMPORTANT_DAY_PROBLEM_TEXT[problem] }
    const day = { ...input, name: input.name.trim(), id: generateId() }
    if (!(await apiCreateImportantDay(day))) return { ok: false, message: OFFLINE }
    setImportantDays((prev) => [...prev, day])
    return { ok: true }
  }, [])

  const updateImportantDay = useCallback(async (day: ImportantDay): Promise<WriteResult> => {
    const problem = validateImportantDay(day)
    if (problem) return { ok: false, message: IMPORTANT_DAY_PROBLEM_TEXT[problem] }
    const next = { ...day, name: day.name.trim() }
    if (!(await apiUpdateImportantDay(next))) return { ok: false, message: OFFLINE }
    setImportantDays((prev) => prev.map((d) => (d.id === next.id ? next : d)))
    return { ok: true }
  }, [])

  const removeImportantDay = useCallback(async (id: string): Promise<WriteResult> => {
    if (!(await apiDeleteImportantDay(id))) return { ok: false, message: OFFLINE }
    setImportantDays((prev) => prev.filter((d) => d.id !== id))
    return { ok: true }
  }, [])

  return {
    markers,
    holidaysStatus,
    importantDaysStatus,
    canEditImportantDays: supabaseConfigured,
    importantDays,
    addImportantDay,
    updateImportantDay,
    removeImportantDay,
  }
}
