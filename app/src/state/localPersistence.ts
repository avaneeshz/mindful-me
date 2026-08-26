import type { ScheduledActivity } from '@/domain/types'
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
