import {
  formatDetail,
  newestFirst,
  pruneEntries,
  type ActivityLogEntry,
  type ActivityLogInput,
} from '@/domain/activityLog'
import { deleteLogEntries, loadAllLogEntries, saveLogEntry } from '@/lib/activityLogStorage'

/**
 * The user activity log service: one module-level instance so any layer —
 * the Supabase fetch wrapper, the sync queue, a hook, the click listener — can
 * `logActivity(...)` without a provider. It records nothing until a user is
 * signed in (so the sign-in form is never captured), keeps each user's entries
 * apart, and prunes everything older than three days on start, hourly, and as
 * it grows. Signing out does NOT clear it: the log has to survive a
 * log-out / log-in, which is exactly when a lost write gets noticed.
 */
const PRUNE_EVERY_MS = 60 * 60 * 1000

let all: ActivityLogEntry[] = []
let currentUserId: string | null = null
let snapshot: readonly ActivityLogEntry[] = []
let lastAt = 0
let hydrated: Promise<void> | null = null
let pruneTimer: ReturnType<typeof setInterval> | null = null
const listeners = new Set<() => void>()

function rebuildSnapshot(): void {
  snapshot = currentUserId ? newestFirst(all.filter((entry) => entry.userId === currentUserId)) : []
  for (const listener of listeners) listener()
}

function prune(now = Date.now()): void {
  const kept = pruneEntries(all, now)
  if (kept.length === all.length) return
  const keptIds = new Set(kept.map((entry) => entry.id))
  const dropped = all.filter((entry) => !keptIds.has(entry.id)).map((entry) => entry.id)
  all = kept
  void deleteLogEntries(dropped)
  rebuildSnapshot()
}

function hydrate(): Promise<void> {
  if (!hydrated) {
    hydrated = loadAllLogEntries().then((stored) => {
      const known = new Set(all.map((entry) => entry.id))
      all = [...stored.filter((entry) => !known.has(entry.id)), ...all]
      prune()
      rebuildSnapshot()
    })
  }
  return hydrated
}

/** Called by the auth layer whenever the signed-in user changes. */
export function setActivityLogUser(userId: string | null): void {
  currentUserId = userId
  rebuildSnapshot()
  if (userId === null) return
  void hydrate()
  if (!pruneTimer) pruneTimer = setInterval(() => prune(), PRUNE_EVERY_MS)
}

export function logActivity(input: ActivityLogInput): void {
  if (!currentUserId) return
  // Strictly increasing, so two entries in the same millisecond keep their true order.
  lastAt = Math.max(Date.now(), lastAt + 1)
  const entry: ActivityLogEntry = {
    id: crypto.randomUUID(),
    userId: currentUserId,
    at: lastAt,
    kind: input.kind,
    level: input.level ?? 'info',
    summary: input.summary,
    detail: formatDetail(input.detail),
  }
  all = [...all, entry]
  void saveLogEntry(entry)
  if (all.length % 100 === 0) prune()
  rebuildSnapshot()
}

export function subscribeActivityLog(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getActivityLogSnapshot(): readonly ActivityLogEntry[] {
  return snapshot
}

/** Test seam — resets module state. */
export function resetActivityLogForTests(): void {
  all = []
  currentUserId = null
  snapshot = []
  hydrated = null
  lastAt = 0
  if (pruneTimer) clearInterval(pruneTimer)
  pruneTimer = null
}
