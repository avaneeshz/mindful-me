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

/**
 * Every id in the subtree rooted at `activityId`, INCLUDING that id itself —
 * used to know which rows a tile/activity delete would need to check
 * history for, to clear a stale "selected activity" pointer when its whole
 * subtree disappears, and (via `useActivityHierarchy.ts`'s
 * `removeSubtreeLocally`) to roll back a whole in-flight-added subtree on a
 * rejected save.
 *
 * Guards against a `parentId` cycle the same way `activityPathNames`/
 * `tileIdForActivity` do (found in code review: this walk used to have no
 * such guard — a `visited` Set here is what actually makes that safe, not
 * merely "unlikely to matter" — a corrupted local cache with a real cycle
 * would otherwise re-descend into the same nodes forever, growing `result`/
 * `stack` without bound and hanging the tab on every one of this function's
 * three real call sites, two of them on interactive paths).
 */
export function collectSubtreeIds(activities: readonly ActivityRow[], activityId: string): string[] {
  const byParent = new Map<string, ActivityRow[]>()
  for (const activity of activities) {
    if (activity.parentId === null) continue
    const bucket = byParent.get(activity.parentId)
    if (bucket) bucket.push(activity)
    else byParent.set(activity.parentId, [activity])
  }

  const result: string[] = [activityId]
  const visited = new Set<string>([activityId])
  const stack = [activityId]
  while (stack.length > 0) {
    const current = stack.pop()!
    for (const child of byParent.get(current) ?? []) {
      if (visited.has(child.id)) continue
      visited.add(child.id)
      result.push(child.id)
      stack.push(child.id)
    }
  }
  return result
}

/**
 * The display path from the tile's top-level activity down to `activityId`,
 * e.g. ["Body Care (self)", "Oiling", "Face"] — empty if `activityId` isn't
 * found.
 *
 * Guards against a `parentId` cycle the same way the sibling `tileIdForActivity`
 * below does (found in code review: this walk has the identical unbounded
 * shape, and it runs on an interactive path too — `ActivityTree.tsx`'s
 * "Show N hidden activities" list, once per hidden row) — a real cycle
 * should never exist, but a corrupted local cache is cheap insurance against
 * hanging the render rather than failing gracefully like its sibling.
 */
export function activityPathNames(activities: readonly ActivityRow[], activityId: string): string[] {
  const byId = new Map(activities.map((a) => [a.id, a]))
  const path: string[] = []
  const visited = new Set<string>()
  let current = byId.get(activityId)
  while (current) {
    if (visited.has(current.id)) break
    visited.add(current.id)
    path.unshift(current.name)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return path
}

/**
 * Which tile `activityId` ultimately belongs to — walks `parentId` up BY ID
 * to the root, then returns that root's own `tileId`. Found in code review:
 * a caller (`ActivityLibraryPanel.tsx`) used to answer this by NAME instead
 * (`activities.find(a => a.name === path[0] && a.parentId === null)`), which
 * silently matches the WRONG root whenever two different top-level
 * activities across two different tiles happen to share a name — the same
 * root cause `20260927060000_activities_unique_top_level_name_per_user.sql`
 * closes at the database level (a DB constraint now prevents that collision
 * from being created at all, going forward), but the correct client-side
 * fix is simply to never resolve "which tile" by name in the first place —
 * an activity's own `parentId` chain already answers that unambiguously,
 * with no uniqueness assumption needed at all. Returns `null` for an unknown
 * id or a root with no `tileId` (a legacy shared-catalog row, or the
 * activity itself no longer exists in `activities`).
 *
 * Guards against a `parentId` cycle (found in code review: this walk has no
 * bound otherwise, and it runs on an interactive path —
 * `ActivityLibraryPanel`'s own effect, re-run on every activities/selection
 * change) — a real cycle should never exist (nothing in this codebase's own
 * create/reorder paths can construct one), but a corrupted local cache is
 * cheap insurance against either an infinite loop, so this bails out to
 * `null` rather than hanging the render the moment it revisits a node.
 */
export function tileIdForActivity(activities: readonly ActivityRow[], activityId: string): string | null {
  const byId = new Map(activities.map((a) => [a.id, a]))
  const visited = new Set<string>()
  let current = byId.get(activityId)
  while (current && current.parentId !== null) {
    if (visited.has(current.id)) return null
    visited.add(current.id)
    current = byId.get(current.parentId)
  }
  return current?.tileId ?? null
}

/**
 * Shared by `isTopLevelNameTaken`/`isSiblingNameTaken` (found in code
 * review: the two used to duplicate this exact trim+exclude-self+name-match
 * logic, differing only in which `parentId` scopes the comparison — a
 * future change to the comparison rule, e.g. case-insensitivity, would have
 * had to be kept in sync by hand across both copies otherwise).
 */
function isNameTakenAtParent(
  activities: readonly ActivityRow[],
  parentId: string | null,
  name: string,
  excludeActivityId?: string,
): boolean {
  const trimmed = name.trim()
  return activities.some((a) => a.parentId === parentId && a.id !== excludeActivityId && a.name === trimmed)
}

/**
 * Whether `name` (exact match — the same case-sensitive comparison the
 * database's own `activities_top_level_name_per_user_idx` uses) already
 * belongs to one of this user's OTHER top-level activities — across EVERY
 * tile, not just one (the approved fix is a user-wide constraint, not a
 * per-tile one — see that migration's own doc comment). `excludeActivityId`
 * (the node itself, when renaming) is never counted as a collision against
 * its own current name. A HIDDEN top-level activity still occupies its name
 * exactly as a visible one does — callers must pass the full, unfiltered
 * activity list, never one already filtered down to visible/one-tile rows.
 *
 * The one client-side check standing between a user and the DB's own
 * `duplicate_top_level_name` rejection — see `ActivityTree.tsx`'s add/rename
 * forms, the actual UX fix (the DB constraint is the safety net behind it,
 * per rule 1's "enforce in the DB too, never rely on only one layer").
 */
export function isTopLevelNameTaken(
  activities: readonly ActivityRow[],
  name: string,
  excludeActivityId?: string,
): boolean {
  return isNameTakenAtParent(activities, null, name, excludeActivityId)
}

/**
 * Whether `name` already belongs to one of `parentId`'s OTHER direct
 * children — the scope the database's own pre-existing
 * `activities_parent_id_name_key` (`unique (parent_id, name)`) already
 * enforces correctly (a non-null `parent_id` was never subject to the
 * NULL-distinctness problem `isTopLevelNameTaken`'s own doc comment
 * describes, so no DB-side change was needed for this scope). This
 * client-side check exists purely so a sub-activity rename or a new
 * sub-activity gets the same immediate inline feedback a top-level one now
 * does (found in code review: without it, a sibling-name collision still
 * gets rejected, just via a round trip to the server and the generic
 * top-of-tree error banner instead of the inline error next to the row that
 * actually failed) — see `ActivityTree.tsx`'s rename / add-sub-activity
 * forms.
 */
export function isSiblingNameTaken(
  activities: readonly ActivityRow[],
  parentId: string,
  name: string,
  excludeActivityId?: string,
): boolean {
  return isNameTakenAtParent(activities, parentId, name, excludeActivityId)
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

/**
 * The sibling order after moving `id` one place up (`-1`) or down (`1`), or
 * `null` when it can't move that way (already first/last, or not in the
 * list) — what the inline editor's up/down buttons hand to `reorder`. The tap
 * equivalent of any drag-to-reorder (portability rule 5).
 */
export function moveInOrder(ids: readonly string[], id: string, direction: -1 | 1): string[] | null {
  const index = ids.indexOf(id)
  const target = index + direction
  if (index < 0 || target < 0 || target >= ids.length) return null
  const next = [...ids]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

/** Direct children of `parentId` (or a tile's top-level rows when `parentId` is null), split by visibility and sorted like `buildActivityTree`'s siblings. */
export function childrenOf(
  activities: readonly ActivityRow[],
  parentId: string | null,
  tileId: string,
): { visible: ActivityRow[]; hidden: ActivityRow[] } {
  const rows = activities
    .filter((a) => (parentId === null ? a.parentId === null && a.tileId === tileId : a.parentId === parentId))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  return { visible: rows.filter((a) => !a.hidden), hidden: rows.filter((a) => a.hidden) }
}
