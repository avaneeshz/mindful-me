import { useEffect, useState } from 'react'
import { localDateISO } from '@/lib/localTime'

/**
 * Tile Redesign §5 — the one new piece of state a `manual` disappear rule
 * needs: which item names the user has explicitly marked done TODAY. Purely
 * a picker-presentation concept (never synced, never a `ScheduledActivity`
 * field) — reopening the app on a different day starts every item unlocked
 * again, by construction: the storage key below is namespaced per calendar
 * day, exactly like `state/localPersistence.ts`'s board cache, and a new day
 * simply never had anything written under its own key.
 */

const STORAGE_PREFIX = 'mindful-me:dismissed:'

function keyFor(date: Date): string {
  return `${STORAGE_PREFIX}${localDateISO(date)}`
}

/**
 * Fails closed (never throws), same contract as `loadLocalActivities`: a
 * private-browsing tab, a full quota, or storage blocked by policy degrades
 * to "nothing dismissed yet" rather than crashing the picker.
 */
export function loadDismissedNames(date: Date): string[] {
  try {
    const raw = window.localStorage.getItem(keyFor(date))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

export function saveDismissedNames(date: Date, names: readonly string[]): void {
  try {
    window.localStorage.setItem(keyFor(date), JSON.stringify(names))
  } catch {
    // In-memory state for this render is still correct; only cross-reload
    // durability is lost for this write — same tradeoff `saveLocalActivities`
    // already accepts.
  }
}

/** Add `name` if absent, remove it if present. Pure — the hook below is the only caller. */
export function toggleDismissedName(names: readonly string[], name: string): string[] {
  return names.includes(name) ? names.filter((n) => n !== name) : [...names, name]
}

export interface DismissedActivities {
  dismissed: ReadonlySet<string>
  /** Toggle one item's manual "done for today" mark. */
  toggleDismissed: (name: string) => void
}

/**
 * Per-viewed-day manual-dismiss state, local-first like everything else in
 * this app (rule 6): loads synchronously from storage so there is no flash
 * of "everything unlocked" on mount, and re-loads whenever `date` changes
 * (BL-2's date picker, or a genuine day rollover) rather than carrying one
 * day's dismissals into another's.
 */
export function useDismissedActivities(date: Date): DismissedActivities {
  const [names, setNames] = useState<string[]>(() => loadDismissedNames(date))

  useEffect(() => {
    setNames(loadDismissedNames(date))
  }, [date])

  function toggleDismissed(name: string): void {
    setNames((prev) => {
      const next = toggleDismissedName(prev, name)
      saveDismissedNames(date, next)
      return next
    })
  }

  return { dismissed: new Set(names), toggleDismissed }
}
