/**
 * Pure tree helpers over the user-owned tile/activity hierarchy
 * (`public.tiles` + `public.activities`, PICKER-CUSTOM-1 — see the
 * full-stack-engineer agent definition's "Full user customization of the
 * activity-picker hierarchy" section). No React, no Supabase — the flat
 * rows come from `state/useTiles.ts`/`state/useActivityHierarchy.ts`, this
 * module only ever turns them into the shapes a tree UI needs.
 *
 * Depth is genuinely arbitrary (the schema's `parent_id` self-reference has
 * no level cap) — every function here walks `parentId` generically rather
 * than assuming "top-level -> sub -> third" the way the old static
 * `data/activities.ts` catalog did.
 */

export interface ActivityRow {
  id: string
  name: string
  tileId: string | null
  parentId: string | null
  iconKey: string | null
  hidden: boolean
  sortOrder: number
}

export interface ActivityNode extends ActivityRow {
  children: ActivityNode[]
}

/** Builds one tile's activity tree from the user's full flat activity list — top-level nodes are those with `tileId === tileId` (and `parentId === null`), each with its descendants nested arbitrarily deep. Siblings are sorted by `sortOrder`, then `name` as a stable tiebreak. */
export function buildActivityTree(activities: readonly ActivityRow[], tileId: string): ActivityNode[] {
  const byParent = new Map<string | null, ActivityRow[]>()
  for (const activity of activities) {
    const key = activity.parentId
    const bucket = byParent.get(key)
    if (bucket) bucket.push(activity)
    else byParent.set(key, [activity])
  }

  const sortSiblings = (rows: ActivityRow[]): ActivityRow[] =>
    [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))

  function toNode(row: ActivityRow): ActivityNode {
    const children = sortSiblings(byParent.get(row.id) ?? []).map(toNode)
    return { ...row, children }
  }

  const topLevel = sortSiblings(activities.filter((a) => a.parentId === null && a.tileId === tileId))
  return topLevel.map(toNode)
}

/** Every id in the subtree rooted at `activityId`, INCLUDING that id itself — used to know which rows a tile/activity delete would need to check history for, and to clear a stale "selected activity" pointer when its whole subtree disappears. */
export function collectSubtreeIds(activities: readonly ActivityRow[], activityId: string): string[] {
  const byParent = new Map<string, ActivityRow[]>()
  for (const activity of activities) {
    if (activity.parentId === null) continue
    const bucket = byParent.get(activity.parentId)
    if (bucket) bucket.push(activity)
    else byParent.set(activity.parentId, [activity])
  }

  const result: string[] = [activityId]
  const stack = [activityId]
  while (stack.length > 0) {
    const current = stack.pop()!
    for (const child of byParent.get(current) ?? []) {
      result.push(child.id)
      stack.push(child.id)
    }
  }
  return result
}

/** The display path from the tile's top-level activity down to `activityId`, e.g. ["Body Care (self)", "Oiling", "Face"] — empty if `activityId` isn't found. */
export function activityPathNames(activities: readonly ActivityRow[], activityId: string): string[] {
  const byId = new Map(activities.map((a) => [a.id, a]))
  const path: string[] = []
  let current = byId.get(activityId)
  while (current) {
    path.unshift(current.name)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return path
}

/** Every activity a tile-deletion would take with it (its whole owned subtree) — used only to decide whether `activity_has_history` needs checking client-side before even attempting the RPC (the RPC re-checks server-side regardless; this is purely a fast "should we warn first" signal, never the actual authority). */
export function activitiesForTile(activities: readonly ActivityRow[], tileId: string): ActivityRow[] {
  const topLevelIds = new Set(activities.filter((a) => a.tileId === tileId).map((a) => a.id))
  if (topLevelIds.size === 0) return []
  const all: ActivityRow[] = []
  for (const id of topLevelIds) {
    for (const descendantId of collectSubtreeIds(activities, id)) {
      const row = activities.find((a) => a.id === descendantId)
      if (row) all.push(row)
    }
  }
  return all
}
