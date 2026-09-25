import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const SLOT_MINUTES = 30
export const SLOTS_PER_DAY = 48

const pad = (n: number) => String(n).padStart(2, '0')

/** "09:30" for slot 19 */
export function slotStart(slot: number) {
  const m = slot * SLOT_MINUTES
  return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`
}

/** "09:30 – 10:00" */
export function slotRange(slot: number) {
  return `${slotStart(slot)} – ${slotStart(slot + 1)}`
}

/** Minutes past midnight → "6:15 AM" (wraps past 24h) */
export function formatClock(minutes: number) {
  const m = ((minutes % 1440) + 1440) % 1440
  const h = Math.floor(m / 60)
  const suffix = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return { time: `${h12}:${pad(m % 60)}`, suffix }
}

export function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function currentSlot(now = new Date()) {
  return Math.floor((now.getHours() * 60 + now.getMinutes()) / SLOT_MINUTES)
}

export function dateKey(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fromKey(key: string) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(key: string, delta: number) {
  const d = fromKey(key)
  d.setDate(d.getDate() + delta)
  return dateKey(d)
}

export const todayKey = () => dateKey(new Date())

export function formatDay(key: string, style: 'short' | 'long' = 'short') {
  const d = fromKey(key)
  if (style === 'long') {
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  }
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function relativeDay(key: string) {
  const t = todayKey()
  if (key === t) return 'Today'
  if (key === addDays(t, -1)) return 'Yesterday'
  if (key === addDays(t, 1)) return 'Tomorrow'
  return null
}

/** Small deterministic PRNG so seeded history is stable between reloads */
export function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}
