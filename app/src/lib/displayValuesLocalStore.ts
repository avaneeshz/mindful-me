import type { DisplayButtonKey } from '@/domain/displayButtons'

const STORAGE_PREFIX = 'mindful-me:display:'

function keyFor(buttonKey: DisplayButtonKey): string {
  return `${STORAGE_PREFIX}${buttonKey}`
}

type DayMap = Record<string, number>

function readMap(buttonKey: DisplayButtonKey): DayMap {
  try {
    const raw = window.localStorage.getItem(keyFor(buttonKey))
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as DayMap) : {}
  } catch {
    return {}
  }
}

/**
 * Per-day set/replace storage for a display button — one key per button
 * holding a `{ 'YYYY-MM-DD': number }` map. Local-only (no backend), fail-
 * closed like every other local store in this app.
 */
export function loadDisplayValue(buttonKey: DisplayButtonKey, date: string): number | null {
  const value = readMap(buttonKey)[date]
  return typeof value === 'number' ? value : null
}

export function saveDisplayValue(buttonKey: DisplayButtonKey, date: string, value: number | null): void {
  try {
    const map = readMap(buttonKey)
    if (value === null) {
      delete map[date]
    } else {
      map[date] = value
    }
    window.localStorage.setItem(keyFor(buttonKey), JSON.stringify(map))
  } catch {
    // In-memory state is still correct; only cross-reload durability is lost.
  }
}

/** One past day's stored value, for the history list. */
export interface DisplayValueHistoryEntry {
  date: string
  value: number
}

/**
 * Pure: turns a raw `{ 'YYYY-MM-DD': number }` day-map into a history list,
 * most recent day first. Split out from `listLocalDisplayValues` below so it
 * can be tested without a `window.localStorage` to read from — the same
 * "pure logic separated from its I/O wrapper" shape
 * `state/dismissedActivities.ts`'s own `toggleDismissedName` already
 * establishes. ISO date strings sort correctly as plain strings, so no date
 * parsing is needed here.
 */
export function sortDisplayValueHistory(map: Readonly<DayMap>): DisplayValueHistoryEntry[] {
  return Object.entries(map)
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

/**
 * Every day this button has ever had a value for on THIS device, most
 * recent first — the local day-map's own history, nothing extra tracked.
 * For a `synced: true` button (Protein — see `state/useDisplayValueHistory.ts`)
 * this is the local-first cache the server reconciles into; for a local-only
 * button (Steps) it is the only history that exists at all, since nothing
 * about Steps syncs off this device. Unbounded on purpose, like every other
 * "one row per calendar day" history in this app (`list_daily_values`'s own
 * reasoning) — a device's own day-value log doesn't grow the way a user's
 * full activity history would.
 */
export function listLocalDisplayValues(buttonKey: DisplayButtonKey): DisplayValueHistoryEntry[] {
  return sortDisplayValueHistory(readMap(buttonKey))
}
