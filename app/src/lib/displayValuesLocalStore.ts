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
