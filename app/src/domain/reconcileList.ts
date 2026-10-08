/**
 * Merging a server list into what the device already holds, WITHOUT ever
 * erasing a change the user made that the server hasn't confirmed yet.
 *
 * The old pattern was `setList(server)` — wholesale replacement — so any row
 * whose write had failed (or was still in flight) simply disappeared on the
 * next load. This is the rule that replaces it, same as
 * `state/reconcileServerActivities.ts` but generic:
 *
 *   - `pendingSaveIds`   — rows with an unconfirmed create/edit. The LOCAL
 *     copy wins, and a pending row the server has never heard of is kept.
 *   - `pendingDeleteIds` — rows with an unconfirmed delete. The server's
 *     stale copy is dropped rather than resurrected.
 *   - everything else is trusted from the server as-is, which is what lets an
 *     edit or delete made on another device show up here.
 *
 * Server order is kept; local-only pending rows follow.
 */
export function reconcileList<T>(
  local: readonly T[],
  server: readonly T[],
  pendingSaveIds: ReadonlySet<string>,
  pendingDeleteIds: ReadonlySet<string>,
  idOf: (row: T) => string,
): T[] {
  const localById = new Map(local.map((row) => [idOf(row), row]))
  const seen = new Set<string>()
  const merged: T[] = []

  for (const row of server) {
    const id = idOf(row)
    seen.add(id)
    if (pendingDeleteIds.has(id)) continue
    merged.push(pendingSaveIds.has(id) ? (localById.get(id) ?? row) : row)
  }
  for (const row of local) {
    const id = idOf(row)
    if (seen.has(id) || pendingDeleteIds.has(id)) continue
    if (pendingSaveIds.has(id)) merged.push(row)
  }
  return merged
}
