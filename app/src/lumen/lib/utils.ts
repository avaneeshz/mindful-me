import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { dateFromLocalDateISO, localDateISO } from '@/lib/localTime'
import { addDaysISO } from '@/lumen/domain/lumenDay'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

/** `YYYY-MM-DD` keys throughout Lumen are the app's own local-date strings. */
export const dateKey = localDateISO
export const fromKey = dateFromLocalDateISO
export const addDays = addDaysISO

export function formatDay(key: string, style: 'short' | 'long' = 'short') {
  const d = fromKey(key)
  if (style === 'long') {
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  }
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** "Sun" — the short weekday alone, for tags like the next day beside after-midnight times. */
export function weekdayShort(key: string) {
  return fromKey(key).toLocaleDateString('en-GB', { weekday: 'short' })
}

/** "Today" / "Yesterday" relative to the current Lumen day (see `lumenDayOf`), else null. */
export function relativeDay(key: string, t: string) {
  if (key === t) return 'Today'
  if (key === addDays(t, -1)) return 'Yesterday'
  if (key === addDays(t, 1)) return 'Tomorrow'
  return null
}
