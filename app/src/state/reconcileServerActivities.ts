import type { ScheduledActivity } from '@/domain/types'

/**
 * Bug A (write-failure-visibility incident) — the cold-load/date-switch
 * effect used to hand the server's response straight to `hydrate`, which
 * wholesale-replaced `state.activities`. Whenever the server's list came back
 * missing an activity the client had already written locally — because that
 * write's background sync had failed, for ANY reason, and hadn't landed yet —
 * the next reconciliation (a reload, reopening the tab, navigating the date
 * picker away and back) silently erased it: there was no way to tell "the
 * server has nothing because there's genuinely nothing" from "the server has
 * nothing because my own write never reached it."
 *
 * This function is the fix: MERGE the server's view with the local one,
 * using the durable retry queue (`state/syncQueue.ts`) as the source of truth
 * for which activities are still unconfirmed —
 *
 *   - `pendingActivityIds`       — an outstanding create/reschedule/flags/
 *     status/restore/reflection write. The LOCAL copy is kept regardless of
 *     what (if anything) the server says about that id, since the server's
 *     answer might simply predate our own not-yet-landed write.
 *   - `pendingDeleteActivityIds` — an outstanding delete. The server's copy
 *     (stale — the delete hasn't landed yet) is dropped rather than let back
 *     in, since the user already saw it removed.
 *
 * Anything NOT in either set is trusted from the server as-is: this is what
 * keeps multi-device sync working (an edit or delete made on another device,
 * which this device never touched, still needs to show up here) — the queue,
 * not "am I missing it," is what marks a LOCAL write as still in flight.
 *
 * A local activity that has nothing outstanding in the queue AND is absent
 * from the server response is treated as genuinely gone (deleted elsewhere,
 * already confirmed) — this only holds going forward: every create/edit now
 * enqueues its own retry-queue entry in the same effect that persists it
 * locally (see `BoardContext.tsx`), so there is no window where a local
 * write exists but isn't tracked in the queue.
 */
export function reconcileServerActivities(
  localActivities: readonly ScheduledActivity[],
  serverActivities: readonly ScheduledActivity[],
  pendingActivityIds: ReadonlySet<string>,
  pendingDeleteActivityIds: ReadonlySet<string>,
): ScheduledActivity[] {
  const localById = new Map(localActivities.map((activity) => [activity.id, activity]))
  const merged: ScheduledActivity[] = []
  const seen = new Set<string>()

  for (const server of serverActivities) {
    seen.add(server.id)
    // An unconfirmed local delete — never let the server's stale copy back in.
    if (pendingDeleteActivityIds.has(server.id)) continue
    const local = localById.get(server.id)
    // An unconfirmed local write — prefer it over whatever the server (which
    // may simply predate that write) says.
    merged.push(pendingActivityIds.has(server.id) && local ? local : server)
  }

  for (const local of localActivities) {
    if (seen.has(local.id)) continue // already handled above
    if (pendingDeleteActivityIds.has(local.id)) continue // shouldn't exist locally, but never resurrect one that would
    if (pendingActivityIds.has(local.id)) {
      // Not yet on the server at all (e.g. an unsynced create) — this is
      // exactly the case Bug A dropped. Never drop it.
      merged.push(local)
    }
    // else: local-only, nothing outstanding, and the server doesn't have it —
    // trust the server's absence (e.g. confirmed-deleted from another device).
  }

  return merged
}
