import { resolveIcon } from '@/lib/iconRegistry'
import type { ActivityCard, Category, CategoryId } from './types'

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
  /**
   * "Locks/disappears for the rest of the day" (`domain/disappear.ts`) —
   * only ever meaningful for a TOP-LEVEL row (`parentId === null`); a
   * drill-down option is always `'manual'`/`null` (enforced server-side too,
   * see `disappear_only_for_top_level`). `'auto'` always carries a real
   * `disappearLimit`; `'manual'` never does.
   */
  disappearMode: 'manual' | 'auto'
  disappearLimit: number | null
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

/** A `public.tiles` row, structurally (no direct dependency on `api/tiles.ts`'s `TileDto` — kept duck-typed so this domain module stays independent of the api layer). */
export interface LiveTile {
  id: string
  label: string
  iconKey: string
  hidden: boolean
  sortOrder: number
}

/**
 * Converts a user's own live `tiles` rows into the `Category` record + the
 * on-screen tile order `data/activities.ts`'s live registry needs
 * (PICKER-CUSTOM-1) — hidden tiles excluded, visible ones sorted by
 * `sortOrder`. Pure, and the one place this conversion is tested;
 * `state/useLiveActivityCatalogSync.ts`'s own effect around it is thin,
 * untested React-hook glue, per this repo's no-jsdom testing convention
 * (`.claude/agent-memory/full-stack-engineer/feedback_hook_testing_no_jsdom.md`).
 */
export function liveCategoriesFromTiles(
  tiles: readonly LiveTile[],
): { categories: Record<CategoryId, Category>; order: CategoryId[] } {
  const visible = [...tiles].filter((t) => !t.hidden).sort((a, b) => a.sortOrder - b.sortOrder)
  const categories: Record<CategoryId, Category> = {}
  for (const tile of visible) {
    categories[tile.id] = {
      id: tile.id,
      label: tile.label,
      // No colour system any more (monochrome retheme) — `deep`/`light`/
      // `onDeep` are inert fields nothing still reads; see
      // `data/activities.ts`'s top-of-file comment.
      deep: '',
      light: '',
      onDeep: 'text-charcoal',
      icon: resolveIcon(tile.iconKey),
    }
  }
  return { categories, order: visible.map((t) => t.id) }
}

/**
 * Converts one live activity NODE (already assembled into a tree by
 * `buildActivityTree`) into the generalized `ActivityCard` shape
 * `domain/boardReducer.ts`'s `isStagingComplete`/`stagingOptions` walk —
 * arbitrary depth, via `children`, never a 2-level cap.
 */
export function activityNodeToCard(node: ActivityNode, tileId: CategoryId): ActivityCard {
  return {
    name: node.name,
    categoryId: tileId,
    icon: resolveIcon(node.iconKey),
    color: '',
    onColor: 'text-charcoal',
    disappear:
      node.disappearMode === 'auto' && node.disappearLimit
        ? { mode: 'auto', limit: node.disappearLimit }
        : { mode: 'manual' },
    children: node.children.length > 0 ? node.children.map((child) => activityNodeToCard(child, tileId)) : undefined,
  }
}

/** Every visible tile's activity tree, flattened into one `ActivityCard[]` in tile order — the exact shape `data/activities.ts`'s `setLiveActivityCatalog` stores as its live `cards`. Hidden activities (and everything under them) are excluded. */
export function liveActivityCardsFromRows(
  activities: readonly ActivityRow[],
  tileOrder: readonly CategoryId[],
): ActivityCard[] {
  const visible = activities.filter((a) => !a.hidden)
  return tileOrder.flatMap((tileId) => buildActivityTree(visible, tileId).map((node) => activityNodeToCard(node, tileId)))
}
