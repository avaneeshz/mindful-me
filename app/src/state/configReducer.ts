import type {
  AttributeOverrideRow,
  AttributeType,
  CatalogActivityRow,
  CatalogCategoryRow,
} from '@/domain/catalog'

/**
 * The Configuration screen's staged-edit reducer — mirrors `boardReducer.ts`'s
 * own staging pattern exactly (see the full-stack-engineer agent definition's
 * "Catalog Customization" section): every add/remove/attribute-list edit only
 * touches THIS state, never `CatalogContext` directly, until the screen's own
 * Save action commits it (`SettingsPage.tsx`'s `handleSave`, which applies the
 * result to `CatalogContext` instantly — rule 6 — and fires the queued
 * `pendingOps` at the server in the background via `state/configSync.ts`).
 *
 * A row added this session gets a `temp:<uuid>` id (never a real DB id) —
 * `isTempId` below is the one place that distinction is tested. Removing a
 * temp row before Save drops it (and any of ITS OWN temp descendants)
 * outright: nothing ever reached the server, so there is nothing to soft-
 * delete (the architecture's "hard delete only for a same-session, never-
 * synced row" rule). Removing a REAL row instead flips its own `isActive` to
 * false locally and queues a `deactivate*` op — never a cascade to its real
 * children (see `removeActivity`'s own comment for why that's fine).
 */

export function isTempId(id: string): boolean {
  return id.startsWith('temp:')
}

function newTempId(): string {
  return `temp:${crypto.randomUUID()}`
}

export type PendingCatalogOp =
  | { kind: 'createCategory'; tempId: string; label: string; iconKey: string }
  | { kind: 'createActivity'; tempId: string; name: string; categoryId: string | null; parentId: string | null; iconKey: string }
  | { kind: 'deactivateCategory'; id: string }
  | { kind: 'deactivateActivity'; id: string }
  | { kind: 'setAttributeOptions'; activityId: string; attributeType: AttributeType; optionIds: string[] }

export interface ConfigState {
  categories: CatalogCategoryRow[]
  activities: CatalogActivityRow[]
  /** Working, id-keyed overrides (not yet collapsed to `AttributeOverrideMap` — that only matters
   * for rendering the log-activity pickers, which this screen doesn't do). */
  overrides: AttributeOverrideRow[]
  /** null = showing the tile list. */
  selectedCategoryId: string | null
  /** null = showing the selected tile's activity list. */
  selectedActivityId: string | null
  /** null = showing the selected activity's sub-option list (+ its attribute panel). */
  selectedSubId: string | null
  pendingOps: PendingCatalogOp[]
  dirty: boolean
}

export function initConfigState(
  categories: CatalogCategoryRow[],
  activities: CatalogActivityRow[],
  overrides: AttributeOverrideRow[],
): ConfigState {
  return {
    categories,
    activities,
    overrides,
    selectedCategoryId: null,
    selectedActivityId: null,
    selectedSubId: null,
    pendingOps: [],
    dirty: false,
  }
}

export type ConfigAction =
  /** Re-baselines the whole screen against a freshly-saved (or freshly-loaded) row set — clears
   * `pendingOps`/`dirty`/selection, same as a fresh `initConfigState`. Used right after Save applies
   * the working rows to `CatalogContext`, so further edits stage cleanly against the new baseline. */
  | { type: 'reset'; categories: CatalogCategoryRow[]; activities: CatalogActivityRow[]; overrides: AttributeOverrideRow[] }
  | { type: 'selectCategory'; id: string | null }
  | { type: 'selectActivity'; id: string | null }
  | { type: 'selectSub'; id: string | null }
  | { type: 'addCategory'; label: string; iconKey: string }
  | { type: 'removeCategory'; id: string }
  | { type: 'addActivity'; name: string; iconKey: string }
  | { type: 'removeActivity'; id: string }
  | { type: 'setAttributeOptions'; activityId: string; attributeType: AttributeType; optionIds: string[] }

function nextSortOrder<T extends { sortOrder: number }>(rows: T[]): number {
  return rows.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1
}

/** Every activity row whose `parentId` (transitively) resolves back to `rootId`. */
function descendantIds(activities: CatalogActivityRow[], rootId: string): string[] {
  const ids: string[] = []
  const stack = [rootId]
  while (stack.length > 0) {
    const id = stack.pop() as string
    for (const row of activities) {
      if (row.parentId === id) {
        ids.push(row.id)
        stack.push(row.id)
      }
    }
  }
  return ids
}

export function configReducer(state: ConfigState, action: ConfigAction): ConfigState {
  switch (action.type) {
    case 'reset':
      return initConfigState(action.categories, action.activities, action.overrides)

    case 'selectCategory':
      if (state.selectedCategoryId === action.id) return state
      // Drilling to a different tile (or back to the tile list) abandons any
      // deeper selection — it belonged to the tile being left.
      return { ...state, selectedCategoryId: action.id, selectedActivityId: null, selectedSubId: null }

    case 'selectActivity':
      if (state.selectedActivityId === action.id) return state
      return { ...state, selectedActivityId: action.id, selectedSubId: null }

    case 'selectSub':
      if (state.selectedSubId === action.id) return state
      return { ...state, selectedSubId: action.id }

    case 'addCategory': {
      const tempId = newTempId()
      const row: CatalogCategoryRow = {
        id: tempId,
        label: action.label,
        iconKey: action.iconKey,
        sortOrder: nextSortOrder(state.categories),
        isActive: true,
      }
      return {
        ...state,
        categories: [...state.categories, row],
        pendingOps: [...state.pendingOps, { kind: 'createCategory', tempId, label: action.label, iconKey: action.iconKey }],
        dirty: true,
      }
    }

    case 'removeCategory': {
      const target = state.categories.find((c) => c.id === action.id)
      if (!target) return state

      // A tile's own activities (top-level cards) are named by `categoryId`,
      // not `parentId` — collect those, then each one's own descendant subs/
      // thirds, exactly like `removeActivity` does for a single card.
      const ownCardIds = state.activities.filter((a) => a.categoryId === action.id).map((a) => a.id)
      const allDescendantActivityIds = new Set(ownCardIds)
      for (const cardId of ownCardIds) {
        for (const id of descendantIds(state.activities, cardId)) allDescendantActivityIds.add(id)
      }

      if (isTempId(action.id)) {
        // Never synced — drop it and every temp activity it owned outright;
        // a REAL activity can never reference a still-unsynced (temp) tile
        // as its category (the create RPC needs a real category id), so
        // every id in `allDescendantActivityIds` here is necessarily temp too.
        return {
          ...state,
          categories: state.categories.filter((c) => c.id !== action.id),
          activities: state.activities.filter((a) => !allDescendantActivityIds.has(a.id)),
          pendingOps: state.pendingOps.filter(
            (op) =>
              !(op.kind === 'createCategory' && op.tempId === action.id) &&
              !(op.kind === 'createActivity' && allDescendantActivityIds.has(op.tempId)),
          ),
          dirty: state.pendingOps.length > 1 || allDescendantActivityIds.size > 0,
        }
      }

      // A REAL tile's own cards/subs/thirds are NOT cascaded to `isActive:
      // false` here (unlike the temp branch above) — deactivating just the
      // one `catalog_categories` row is enough: `buildSnapshotFromRows`
      // already makes a card whose `categoryId` no longer names an ACTIVE
      // category unreachable from the effective catalog regardless of the
      // card's own `isActive` flag (see that module's own doc comment), and
      // the Configuration screen itself can no longer navigate to a
      // deactivated tile either. This also keeps the client's optimistic
      // state consistent with the single `set_catalog_category_active` RPC
      // call this queues — that RPC touches exactly one row, not a cascade.
      const tempDescendants = [...allDescendantActivityIds].filter(isTempId)
      const tempDropSet = new Set(tempDescendants)
      return {
        ...state,
        categories: state.categories.map((c) => (c.id === action.id ? { ...c, isActive: false } : c)),
        activities: state.activities.filter((a) => !tempDropSet.has(a.id)),
        pendingOps: [
          ...state.pendingOps.filter((op) => !(op.kind === 'createActivity' && tempDropSet.has(op.tempId))),
          { kind: 'deactivateCategory', id: action.id },
        ],
        dirty: true,
        selectedCategoryId: state.selectedCategoryId === action.id ? null : state.selectedCategoryId,
        selectedActivityId: allDescendantActivityIds.has(state.selectedActivityId ?? '')
          ? null
          : state.selectedActivityId,
      }
    }

    case 'addActivity': {
      // Where the new row attaches depends entirely on the current drill
      // depth — a top-level card (tile selected, nothing deeper), a sub
      // (card selected), or a third-level option (sub selected).
      const parentId = state.selectedSubId ?? state.selectedActivityId ?? null
      const categoryId = parentId === null ? state.selectedCategoryId : null
      if (parentId === null && categoryId === null) return state // no tile selected — nothing to attach to

      const tempId = newTempId()
      const siblings = state.activities.filter((a) =>
        parentId === null ? a.parentId === null && a.categoryId === categoryId : a.parentId === parentId,
      )
      const row: CatalogActivityRow = {
        id: tempId,
        name: action.name,
        categoryId,
        parentId,
        iconKey: action.iconKey,
        sortOrder: nextSortOrder(siblings),
        isActive: true,
      }
      return {
        ...state,
        activities: [...state.activities, row],
        pendingOps: [
          ...state.pendingOps,
          { kind: 'createActivity', tempId, name: action.name, categoryId, parentId, iconKey: action.iconKey },
        ],
        dirty: true,
      }
    }

    /**
     * Soft-disable-only (DECISIONS.md) — deactivating a card/sub/third never
     * cascades to its own REAL children's `isActive` in the working state (an
     * inactive parent already makes its whole subtree unreachable once
     * `buildSnapshotFromRows` rebuilds the render-ready catalog, so nothing
     * further is needed for correctness — see that module's own doc comment).
     * Only TEMP descendants get stripped here, since they never reached the
     * server and would otherwise sit as orphaned local-only clutter.
     */
    case 'removeActivity': {
      const targetId = action.id
      const target = state.activities.find((a) => a.id === targetId)
      if (!target) return state
      const descendants = descendantIds(state.activities, targetId)

      // Clears a selection that either WAS the removed row, or pointed to one
      // of its now-gone temp descendants, or was a sub hanging off the
      // activity that was just removed/deselected — in every case the thing
      // it named is no longer something the screen can still be showing.
      const clearedActivityId = state.selectedActivityId === targetId ? null : state.selectedActivityId
      function clearedSubId(dropSet: ReadonlySet<string>): string | null {
        if (!state.selectedSubId) return null
        if (state.selectedSubId === targetId) return null
        if (dropSet.has(state.selectedSubId)) return null
        if (clearedActivityId === null && state.selectedActivityId !== null) return null
        return state.selectedSubId
      }

      if (isTempId(action.id)) {
        const dropSet = new Set([action.id, ...descendants])
        return {
          ...state,
          activities: state.activities.filter((a) => !dropSet.has(a.id)),
          pendingOps: state.pendingOps.filter((op) => !(op.kind === 'createActivity' && dropSet.has(op.tempId))),
          dirty: state.pendingOps.length > 1 || dropSet.size > 1,
          selectedActivityId: clearedActivityId,
          selectedSubId: clearedSubId(dropSet),
        }
      }

      const tempDescendants = descendants.filter(isTempId)
      const tempDropSet = new Set(tempDescendants)
      return {
        ...state,
        activities: state.activities
          .filter((a) => !tempDropSet.has(a.id))
          .map((a) => (a.id === action.id ? { ...a, isActive: false } : a)),
        pendingOps: [
          ...state.pendingOps.filter((op) => !(op.kind === 'createActivity' && tempDropSet.has(op.tempId))),
          { kind: 'deactivateActivity', id: action.id },
        ],
        dirty: true,
        selectedActivityId: clearedActivityId,
        selectedSubId: clearedSubId(tempDropSet),
      }
    }

    case 'setAttributeOptions': {
      // A still-unsynced (temp) activity has no real id to attach an override
      // row to yet — the panel that would dispatch this is disabled for a
      // temp activity in `SettingsPage.tsx`, so this is a defensive no-op.
      if (isTempId(action.activityId)) return state
      const withoutThisPair = state.overrides.filter(
        (o) => !(o.activityId === action.activityId && o.attributeType === action.attributeType),
      )
      const nextOverrides =
        action.optionIds.length === 0
          ? withoutThisPair
          : [
              ...withoutThisPair,
              ...action.optionIds.map((optionId) => ({
                activityId: action.activityId,
                attributeType: action.attributeType,
                optionId,
              })),
            ]
      return {
        ...state,
        overrides: nextOverrides,
        pendingOps: [
          ...state.pendingOps.filter(
            (op) =>
              !(op.kind === 'setAttributeOptions' && op.activityId === action.activityId && op.attributeType === action.attributeType),
          ),
          { kind: 'setAttributeOptions', activityId: action.activityId, attributeType: action.attributeType, optionIds: action.optionIds },
        ],
        dirty: true,
      }
    }

    default:
      return state
  }
}
