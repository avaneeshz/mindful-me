import type { HeaderButtonConfig } from '@/domain/headerButtons'

const SNAPSHOT_KEY = 'mindful-me:header-buttons:snapshot'

/**
 * Rule 6 — every write lands locally first, instantly, regardless of
 * connectivity. A single full snapshot of the effective per-user button
 * list (system defaults + this user's own additions, with this user's own
 * hide/reorder state already applied) — the same "one authoritative local
 * copy, server wins once it answers" shape `useNoteEntries`/`useDailyValue`
 * already use, rather than three separately-reconciled pieces. Absent
 * entirely (nothing ever saved here — first run on this device, or no
 * backend ever configured) falls back to `DEFAULT_HEADER_BUTTONS`
 * unmodified, which is itself indistinguishable from "server confirmed
 * exactly the defaults, unmodified" — both render identically.
 *
 * Fails closed (never throws): a private-browsing tab, a full quota, or
 * storage blocked by policy degrades to "this session's in-memory state
 * only" rather than crashing the app, same contract every other local store
 * in this project already follows.
 */
export function loadLocalHeaderButtons(): HeaderButtonConfig[] | null {
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as HeaderButtonConfig[]) : null
  } catch {
    return null
  }
}

export function saveLocalHeaderButtons(buttons: readonly HeaderButtonConfig[]): void {
  try {
    window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(buttons))
  } catch {
    // In-memory state is still correct; only cross-reload durability is lost.
  }
}
