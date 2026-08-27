/**
 * Phase 5 — multi-device conflict resolution, as a PURE function.
 *
 * Rule 7: when two devices edit the same activity, the NEWEST edit wins and
 * the older one is kept (never silently discarded). This module is the
 * detection half — it decides, for one bounded window of days (rule 8 — it is
 * only ever handed the day the board is showing, never a full history), which
 * version of each activity the board should display, and which local edits
 * lost and therefore have to be preserved.
 *
 * The comparison is between two clocks that are genuinely different: a queued
 * local edit is stamped with the DEVICE's clock at the moment the user made
 * it, and a server row carries Postgres's `updated_at` from the moment the
 * other device's write landed. That is the closest available approximation of
 * "which edit is newer" without a distributed clock, and it is the same
 * approximation any last-write-wins system makes; a device whose clock is
 * badly wrong can therefore win or lose incorrectly, which is exactly why the
 * losing edit is preserved rather than dropped.
 *
 * A local edit that has NOTHING queued is never in conflict with anything:
 * it has already synced, so the server's row IS this device's edit (or a
 * newer one from elsewhere) and is simply taken.
 */
import type { ScheduledActivity } from '@/domain/types'
import type { PendingEdit } from './syncQueue'

export interface ReconcileInput {
  /** What the board is showing right now. */
  local: readonly ScheduledActivity[]
  /** The server's authoritative view of the SAME bounded window. */
  server: readonly ScheduledActivity[]
  /** Queued-but-unsent local edits, keyed by activity id. */
  pending: ReadonlyMap<string, PendingEdit>
}

/** One activity whose queued local edit lost to a newer server version. */
export interface ResolvedConflict {
  activityId: string
  /** The winning server row's `updated_at`. */
  serverUpdatedAt: string
  /** The local version that lost, when the board still had one. */
  localSnapshot: ScheduledActivity | null
}

export interface ReconcileResult {
  /** What the board should show, deterministically ordered. */
  activities: ScheduledActivity[]
  conflicts: ResolvedConflict[]
  /**
   * False when the reconciled view is identical to `local`. The caller uses
   * this to avoid re-hydrating for no reason — `hydrate` clears any staged
   * pick, so a background reconcile that changes nothing must not fire it.
   */
  changed: boolean
}

function msOf(iso: string | undefined): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : ms
}

/** Deterministic: by start time, then duration, then id. */
function sortActivities(activities: ScheduledActivity[]): ScheduledActivity[] {
  return [...activities].sort(
    (a, b) =>
      a.startMinutes - b.startMinutes ||
      a.durationMinutes - b.durationMinutes ||
      a.id.localeCompare(b.id),
  )
}

function fingerprint(activities: readonly ScheduledActivity[]): string {
  return sortActivities([...activities])
    .map((a) =>
      [
        a.id,
        a.name ?? '',
        a.path.join('>'),
        a.startMinutes,
        a.durationMinutes,
        a.status,
        [...a.flags].sort().join('|'),
      ].join(':'),
    )
    .join('\n')
}

export function reconcileActivities({ local, server, pending }: ReconcileInput): ReconcileResult {
  const localById = new Map(local.map((activity) => [activity.id, activity]))
  const serverIds = new Set(server.map((activity) => activity.id))
  const conflicts: ResolvedConflict[] = []
  const resolved: ScheduledActivity[] = []

  for (const serverActivity of server) {
    const localActivity = localById.get(serverActivity.id)
    const pendingEdit = pending.get(serverActivity.id)

    // Nothing of ours is waiting to be sent for this activity — the server's
    // row is simply the truth (it is our own last write, or a newer one from
    // another device that we have no competing edit against).
    if (!pendingEdit) {
      resolved.push(serverActivity)
      continue
    }

    const serverMs = msOf(serverActivity.updatedAt)
    const localMs = msOf(pendingEdit.editedAt)

    // Our unsent edit is at least as new as the server's row (or the server
    // told us nothing about when its row changed) — keep ours; the queue will
    // push it, and the server's older version is already preserved in
    // `activity_events` by the DB trigger that wrote it.
    if (serverMs === null || localMs === null || localMs >= serverMs) {
      if (localActivity) resolved.push(localActivity)
      // A pending DELETE that wins simply contributes nothing: the activity
      // stays off the board until the queued delete reaches the server.
      continue
    }

    // The server's row is strictly newer: another device edited this after we
    // did. Server wins; our queued edit is the loser and must be preserved.
    conflicts.push({
      activityId: serverActivity.id,
      serverUpdatedAt: serverActivity.updatedAt as string,
      localSnapshot: localActivity ?? null,
    })
    resolved.push(serverActivity)
  }

  // Local rows the server's window does not contain. Anything with a queued
  // write is ours-in-progress (a create that hasn't been sent, or an edit to
  // a row the server may have dropped) and stays on the board until the queue
  // itself resolves it — a queued write to a row that is genuinely gone comes
  // back as `not_found`, which the engine records as a rejected conflict.
  // Anything with NOTHING queued has already synced, so its absence from the
  // server is authoritative: it was deleted elsewhere.
  for (const localActivity of local) {
    if (serverIds.has(localActivity.id)) continue
    if (pending.has(localActivity.id)) resolved.push(localActivity)
  }

  const activities = sortActivities(resolved)
  return { activities, conflicts, changed: fingerprint(activities) !== fingerprint(local) }
}
