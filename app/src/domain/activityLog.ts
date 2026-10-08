/**
 * User activity log — pure rules and shapes. No React, no storage, no network.
 *
 * The log is the user's own, on-device record of what they did and what the
 * app sent to / got back from the server, kept for three days so a write that
 * "looked saved" but never landed can be traced. It deliberately records full
 * content (note text, logged values): it is shown only to its owner, in their
 * own Settings, and never leaves the device.
 */

export const ACTIVITY_LOG_RETENTION_MS = 3 * 24 * 60 * 60 * 1000

/** Hard ceiling on stored entries so a runaway loop cannot fill device storage. */
export const ACTIVITY_LOG_MAX_ENTRIES = 5000

/** Per-entry detail ceiling — large enough for any note, small enough to bound a bulk read. */
export const ACTIVITY_LOG_MAX_DETAIL_CHARS = 100_000

export type ActivityLogKind = 'tap' | 'save' | 'sync' | 'send' | 'fetch'
export type ActivityLogLevel = 'info' | 'error'

export interface ActivityLogEntry {
  id: string
  /** Owner. The log is per-user: another account on this device never sees it. */
  userId: string
  /** Epoch ms. */
  at: number
  kind: ActivityLogKind
  level: ActivityLogLevel
  /** One line, always shown. */
  summary: string
  /** The complete content, shown when the row is opened. */
  detail?: string
}

export type ActivityLogInput = Pick<ActivityLogEntry, 'kind' | 'summary'> & {
  level?: ActivityLogLevel
  detail?: unknown
}

export const ACTIVITY_LOG_KIND_LABEL: Record<ActivityLogKind, string> = {
  tap: 'Tap',
  save: 'Saved on device',
  sync: 'Sync',
  send: 'Sent to server',
  fetch: 'Loaded from server',
}

export function isExpired(entry: Pick<ActivityLogEntry, 'at'>, now: number): boolean {
  return now - entry.at > ACTIVITY_LOG_RETENTION_MS
}

/** Drops expired entries, then the oldest beyond the ceiling. Input order is not assumed. */
export function pruneEntries(entries: readonly ActivityLogEntry[], now: number): ActivityLogEntry[] {
  const live = entries.filter((entry) => !isExpired(entry, now)).sort((a, b) => a.at - b.at)
  return live.length > ACTIVITY_LOG_MAX_ENTRIES ? live.slice(live.length - ACTIVITY_LOG_MAX_ENTRIES) : live
}

export function truncateText(text: string, max: number = ACTIVITY_LOG_MAX_DETAIL_CHARS): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n… [${text.length - max} more characters not kept]`
}

/** Turns any value into the readable text shown when an entry is opened. */
export function formatDetail(detail: unknown): string | undefined {
  if (detail === undefined || detail === null || detail === '') return undefined
  if (typeof detail === 'string') return truncateText(detail)
  try {
    return truncateText(JSON.stringify(detail, null, 2))
  } catch {
    return truncateText(String(detail))
  }
}

/** Collapses whitespace and shortens a label so a tap reads as one tidy line. */
export function shortLabel(text: string, max = 80): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`
}

/** Newest first. */
export function newestFirst(entries: readonly ActivityLogEntry[]): ActivityLogEntry[] {
  return [...entries].sort((a, b) => b.at - a.at)
}

/** Which calendar-day heading an entry sits under, in the user's own zone (`en-CA` yields YYYY-MM-DD). */
export function dayKey(at: number): string {
  return new Date(at).toLocaleDateString('en-CA')
}

/**
 * What a Supabase request was *about*, in words: `rpc/create_note_entry_v2`,
 * `scheduled_activities`. Returns null for traffic that must never be logged
 * (sign-in / token requests carry credentials).
 */
export function describeSupabasePath(pathname: string): { label: string; sensitive: boolean } | null {
  if (pathname.includes('/auth/v1/')) return null
  if (pathname.includes('/functions/v1/')) {
    // Edge functions carry OAuth codes and tokens — name and status only.
    return { label: `function/${pathname.split('/functions/v1/')[1] ?? ''}`, sensitive: true }
  }
  const rest = pathname.split('/rest/v1/')[1]
  if (rest === undefined) return { label: pathname, sensitive: false }
  return { label: rest.startsWith('rpc/') ? rest : rest.split('/')[0], sensitive: false }
}

export type ActivityLogFilter = 'all' | 'problems'

export interface ActivityLogDay {
  day: string
  /** Epoch ms of the day's newest entry — what the heading's label is formatted from. */
  at: number
  entries: ActivityLogEntry[]
}

export function filterEntries(entries: readonly ActivityLogEntry[], filter: ActivityLogFilter): ActivityLogEntry[] {
  return filter === 'problems' ? entries.filter((entry) => entry.level === 'error') : [...entries]
}

/** Groups an already newest-first list under per-day headings, preserving order. */
export function groupByDay(entries: readonly ActivityLogEntry[]): ActivityLogDay[] {
  const days: ActivityLogDay[] = []
  for (const entry of entries) {
    const key = dayKey(entry.at)
    const last = days[days.length - 1]
    if (last && last.day === key) last.entries.push(entry)
    else days.push({ day: key, at: entry.at, entries: [entry] })
  }
  return days
}
