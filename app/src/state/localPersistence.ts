import type { ScheduledActivity } from '@/domain/types'
import { mergeWindowIntoDay, splitByOwnerDay, WINDOW_DAY_OFFSETS } from '@/domain/windowAxis'
import { localDateISO } from '@/lib/localTime'

const STORAGE_PREFIX = 'mindful-me:board:'

function keyFor(date: Date): string {
  return `${STORAGE_PREFIX}${localDateISO(date)}`
}

/**
 * Rule 6 — every write lands locally first, instantly, regardless of
 * connectivity. `localStorage` is synchronous, so this genuinely blocks
 * nothing the UI is waiting on; it is namespaced per calendar day so a new
 * "today" never accidentally shows yesterday's cached board.
 *
 * Both functions fail closed (never throw): a private-browsing tab, a full
 * quota, or storage blocked by policy must degrade to "this session's
 * in-memory state only" rather than crash the app.
 */
export function loadLocalActivities(date: Date): ScheduledActivity[] | null {
  try {
    const raw = window.localStorage.getItem(keyFor(date))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ScheduledActivity[]) : null
  } catch {
    return null
  }
}

export function saveLocalActivities(date: Date, activities: readonly ScheduledActivity[]): void {
  try {
    window.localStorage.setItem(keyFor(date), JSON.stringify(activities))
  } catch {
    // In-memory reducer state is still correct; only cross-reload durability
    // is lost for this write.
  }
}

function dayAt(date: Date, offset: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset)
}

/**
 * The stored lists of the three calendar days a page can touch (the day before,
 * the day itself, the day after), keyed by offset. Each is that day's own
 * stored list in its own-day minutes, or `null` when nothing was ever stored.
 */
export function loadLocalDays(date: Date): Record<(typeof WINDOW_DAY_OFFSETS)[number], ScheduledActivity[] | null> {
  return {
    [-1]: loadLocalActivities(dayAt(date, -1)),
    0: loadLocalActivities(date),
    1: loadLocalActivities(dayAt(date, 1)),
  }
}

/**
 * Persists a page. Every activity is stored on the calendar day it STARTED on
 * (rule 2), so the page's list is split by owner and each day's own store is
 * updated: what the page loaded from that day is replaced by what the page now
 * says it owns, and anything the page never loaded (outside its window) is left
 * exactly as it was. Same fail-closed contract as `saveLocalActivities`.
 */
export function saveLocalWindow(date: Date, activities: readonly ScheduledActivity[]): void {
  const owned = splitByOwnerDay([...activities])
  // A stretch is at most 24h, so it can only ever land on the three days around the page;
  // anything else is left to its own day's store untouched.
  for (const offset of WINDOW_DAY_OFFSETS) {
    const day = dayAt(date, offset)
    const stored = loadLocalActivities(day) ?? []
    const mine = owned.get(offset) ?? []
    if (stored.length === 0 && mine.length === 0) continue
    saveLocalActivities(day, mergeWindowIntoDay(stored, offset, mine))
  }
}
