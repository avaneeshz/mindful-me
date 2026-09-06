import { describe, expect, it } from 'vitest'
import { configReducer, initConfigState, isTempId, type ConfigState } from './configReducer'
import type { CatalogActivityRow, CatalogCategoryRow } from '@/domain/catalog'

const CATEGORIES: CatalogCategoryRow[] = [
  { id: 'sleep', label: 'Sleep & Rest', iconKey: 'Moon', sortOrder: 0, isActive: true },
  { id: 'food', label: 'Food & Nourishment', iconKey: 'Utensils', sortOrder: 1, isActive: true },
]

const ACTIVITIES: CatalogActivityRow[] = [
  { id: 'card-sleep', name: 'Night Sleep', categoryId: 'sleep', parentId: null, iconKey: 'Moon', sortOrder: 0, isActive: true },
  { id: 'card-supp', name: 'Supplements', categoryId: 'sleep', parentId: null, iconKey: 'Pill', sortOrder: 1, isActive: true },
  { id: 'sub-zinc', name: 'Zinc', categoryId: null, parentId: 'card-supp', iconKey: 'Pill', sortOrder: 0, isActive: true },
]

function start(): ConfigState {
  return initConfigState(CATEGORIES, ACTIVITIES, [])
}

describe('initConfigState', () => {
  it('starts at the tile list with nothing staged', () => {
    const state = start()
    expect(state.selectedCategoryId).toBeNull()
    expect(state.selectedActivityId).toBeNull()
    expect(state.selectedSubId).toBeNull()
    expect(state.pendingOps).toEqual([])
    expect(state.dirty).toBe(false)
  })
})

describe('navigation', () => {
  it('selecting a category clears any deeper selection', () => {
    let state = configReducer(start(), { type: 'selectCategory', id: 'sleep' })
    state = configReducer(state, { type: 'selectActivity', id: 'card-supp' })
    state = configReducer(state, { type: 'selectSub', id: 'sub-zinc' })
    state = configReducer(state, { type: 'selectCategory', id: 'food' })
    expect(state.selectedCategoryId).toBe('food')
    expect(state.selectedActivityId).toBeNull()
    expect(state.selectedSubId).toBeNull()
  })

  it('selecting a different activity clears the sub selection only', () => {
    let state = configReducer(start(), { type: 'selectCategory', id: 'sleep' })
    state = configReducer(state, { type: 'selectActivity', id: 'card-supp' })
    state = configReducer(state, { type: 'selectSub', id: 'sub-zinc' })
    state = configReducer(state, { type: 'selectActivity', id: 'card-sleep' })
    expect(state.selectedCategoryId).toBe('sleep')
    expect(state.selectedActivityId).toBe('card-sleep')
    expect(state.selectedSubId).toBeNull()
  })

  it('re-selecting the same id is a no-op (same object returned)', () => {
    const state = configReducer(start(), { type: 'selectCategory', id: 'sleep' })
    expect(configReducer(state, { type: 'selectCategory', id: 'sleep' })).toBe(state)
  })
})

describe('addCategory', () => {
  it('adds a new active tile with a temp id and queues a createCategory op', () => {
    const state = configReducer(start(), { type: 'addCategory', label: 'Custom Tile', iconKey: 'Sparkles' })
    const added = state.categories.find((c) => c.label === 'Custom Tile')
    expect(added).toBeDefined()
    expect(isTempId(added!.id)).toBe(true)
    expect(added!.isActive).toBe(true)
    expect(state.pendingOps).toEqual([
      { kind: 'createCategory', tempId: added!.id, label: 'Custom Tile', iconKey: 'Sparkles' },
    ])
    expect(state.dirty).toBe(true)
  })

  it('appends after the highest existing sort_order, never reusing/colliding with one', () => {
    const state = configReducer(start(), { type: 'addCategory', label: 'Custom Tile', iconKey: 'Sparkles' })
    const added = state.categories.find((c) => c.label === 'Custom Tile')!
    expect(added.sortOrder).toBe(2)
  })
})

describe('removeCategory', () => {
  it('a NEVER-SYNCED (temp) tile is dropped outright, not soft-disabled', () => {
    let state = configReducer(start(), { type: 'addCategory', label: 'Custom Tile', iconKey: 'Sparkles' })
    const tempId = state.categories.find((c) => c.label === 'Custom Tile')!.id
    state = configReducer(state, { type: 'removeCategory', id: tempId })
    expect(state.categories.find((c) => c.id === tempId)).toBeUndefined()
    expect(state.pendingOps).toEqual([])
  })

  it('a SYSTEM/already-synced tile is soft-disabled (isActive false), never dropped from the array', () => {
    const state = configReducer(start(), { type: 'removeCategory', id: 'sleep' })
    const row = state.categories.find((c) => c.id === 'sleep')
    expect(row?.isActive).toBe(false)
    expect(state.pendingOps).toEqual([{ kind: 'deactivateCategory', id: 'sleep' }])
  })

  it('deactivating a real tile does NOT cascade to its own real cards — they stay isActive, just unreachable', () => {
    // A card whose categoryId no longer names an active tile is already
    // invisible once `buildSnapshotFromRows` rebuilds the effective catalog
    // (see that module's own test) — no cascade needed for correctness, and
    // this keeps the client's optimistic state matching the single-row
    // `set_catalog_category_active` RPC call exactly.
    const state = configReducer(start(), { type: 'removeCategory', id: 'sleep' })
    expect(state.activities.find((a) => a.id === 'card-sleep')?.isActive).toBe(true)
    expect(state.activities.find((a) => a.id === 'card-supp')?.isActive).toBe(true)
  })

  it('removing a real tile clears the selection if it (or its own activity) was selected', () => {
    let state = configReducer(start(), { type: 'selectCategory', id: 'sleep' })
    state = configReducer(state, { type: 'selectActivity', id: 'card-supp' })
    state = configReducer(state, { type: 'removeCategory', id: 'sleep' })
    expect(state.selectedCategoryId).toBeNull()
    expect(state.selectedActivityId).toBeNull()
  })

  it('removing a temp tile also drops any temp cards added under it, with no dangling ops', () => {
    let state = configReducer(start(), { type: 'addCategory', label: 'Custom Tile', iconKey: 'Sparkles' })
    const tempCategoryId = state.categories.find((c) => c.label === 'Custom Tile')!.id
    state = configReducer(state, { type: 'selectCategory', id: tempCategoryId })
    state = configReducer(state, { type: 'addActivity', name: 'New Habit', iconKey: 'Sparkle' })
    state = configReducer(state, { type: 'removeCategory', id: tempCategoryId })
    expect(state.activities.find((a) => a.name === 'New Habit')).toBeUndefined()
    expect(state.pendingOps).toEqual([])
  })
})

describe('addActivity', () => {
  it('does nothing when no tile is selected', () => {
    const state = configReducer(start(), { type: 'addActivity', name: 'Orphan', iconKey: 'Sparkle' })
    expect(state).toEqual(start())
  })

  it('adds a top-level card under the selected tile', () => {
    let state = configReducer(start(), { type: 'selectCategory', id: 'sleep' })
    state = configReducer(state, { type: 'addActivity', name: 'New Habit', iconKey: 'Sparkle' })
    const added = state.activities.find((a) => a.name === 'New Habit')
    expect(added?.categoryId).toBe('sleep')
    expect(added?.parentId).toBeNull()
    expect(isTempId(added!.id)).toBe(true)
    expect(state.pendingOps).toContainEqual({
      kind: 'createActivity',
      tempId: added!.id,
      name: 'New Habit',
      categoryId: 'sleep',
      parentId: null,
      iconKey: 'Sparkle',
    })
  })

  it('adds a sub-option under the selected activity', () => {
    let state = configReducer(start(), { type: 'selectCategory', id: 'sleep' })
    state = configReducer(state, { type: 'selectActivity', id: 'card-supp' })
    state = configReducer(state, { type: 'addActivity', name: 'Magnesium', iconKey: 'Pill' })
    const added = state.activities.find((a) => a.name === 'Magnesium')
    expect(added?.parentId).toBe('card-supp')
    expect(added?.categoryId).toBeNull()
  })

  it('adds a third-level option under the selected sub', () => {
    let state = configReducer(start(), { type: 'selectCategory', id: 'sleep' })
    state = configReducer(state, { type: 'selectActivity', id: 'card-supp' })
    state = configReducer(state, { type: 'selectSub', id: 'sub-zinc' })
    state = configReducer(state, { type: 'addActivity', name: 'Morning', iconKey: 'Pill' })
    const added = state.activities.find((a) => a.name === 'Morning')
    expect(added?.parentId).toBe('sub-zinc')
  })

  it('sort_order is scoped to real siblings, not the whole activities array', () => {
    let state = configReducer(start(), { type: 'selectCategory', id: 'food' })
    state = configReducer(state, { type: 'addActivity', name: 'First Food Card', iconKey: 'Soup' })
    const added = state.activities.find((a) => a.name === 'First Food Card')
    expect(added?.sortOrder).toBe(0) // no existing siblings under 'food', despite 'sleep' already having 2
  })
})

describe('removeActivity', () => {
  it('a temp card is dropped outright with its own temp op removed', () => {
    let state = configReducer(start(), { type: 'selectCategory', id: 'sleep' })
    state = configReducer(state, { type: 'addActivity', name: 'New Habit', iconKey: 'Sparkle' })
    const tempId = state.activities.find((a) => a.name === 'New Habit')!.id
    state = configReducer(state, { type: 'removeActivity', id: tempId })
    expect(state.activities.find((a) => a.id === tempId)).toBeUndefined()
    expect(state.pendingOps).toEqual([])
  })

  it('a real card is soft-disabled, not removed from the array', () => {
    const state = configReducer(start(), { type: 'removeActivity', id: 'card-supp' })
    const row = state.activities.find((a) => a.id === 'card-supp')
    expect(row?.isActive).toBe(false)
    expect(state.pendingOps).toEqual([{ kind: 'deactivateActivity', id: 'card-supp' }])
  })

  it('deactivating a real card leaves its own real sub rows untouched (no cascade — see comment)', () => {
    const state = configReducer(start(), { type: 'removeActivity', id: 'card-supp' })
    expect(state.activities.find((a) => a.id === 'sub-zinc')?.isActive).toBe(true)
  })

  it('deactivating a real card drops any TEMP sub added under it this session', () => {
    let state = configReducer(start(), { type: 'selectCategory', id: 'sleep' })
    state = configReducer(state, { type: 'selectActivity', id: 'card-supp' })
    state = configReducer(state, { type: 'addActivity', name: 'Magnesium', iconKey: 'Pill' })
    state = configReducer(state, { type: 'removeActivity', id: 'card-supp' })
    expect(state.activities.find((a) => a.name === 'Magnesium')).toBeUndefined()
    expect(state.pendingOps).toEqual([{ kind: 'deactivateActivity', id: 'card-supp' }])
  })

  it('removing the selected activity or sub clears that selection', () => {
    let state = configReducer(start(), { type: 'selectCategory', id: 'sleep' })
    state = configReducer(state, { type: 'selectActivity', id: 'card-supp' })
    state = configReducer(state, { type: 'selectSub', id: 'sub-zinc' })
    state = configReducer(state, { type: 'removeActivity', id: 'sub-zinc' })
    expect(state.selectedSubId).toBeNull()
    expect(state.selectedActivityId).toBe('card-supp')
  })

  it('is a no-op for an unknown id', () => {
    const state = start()
    expect(configReducer(state, { type: 'removeActivity', id: 'does-not-exist' })).toBe(state)
  })
})

describe('reset', () => {
  it('re-baselines against a fresh row set, clearing pendingOps/dirty/selection', () => {
    let state = configReducer(start(), { type: 'selectCategory', id: 'sleep' })
    state = configReducer(state, { type: 'addActivity', name: 'New Habit', iconKey: 'Sparkle' })
    expect(state.dirty).toBe(true)

    const reset = configReducer(state, { type: 'reset', categories: CATEGORIES, activities: ACTIVITIES, overrides: [] })
    expect(reset).toEqual(start())
  })
})

describe('setAttributeOptions', () => {
  it('records an allow-list override for a real activity', () => {
    const state = configReducer(start(), {
      type: 'setAttributeOptions',
      activityId: 'card-sleep',
      attributeType: 'quality',
      optionIds: ['Resonance', 'Flow'],
    })
    expect(state.overrides).toEqual([
      { activityId: 'card-sleep', attributeType: 'quality', optionId: 'Resonance' },
      { activityId: 'card-sleep', attributeType: 'quality', optionId: 'Flow' },
    ])
    expect(state.pendingOps).toEqual([
      { kind: 'setAttributeOptions', activityId: 'card-sleep', attributeType: 'quality', optionIds: ['Resonance', 'Flow'] },
    ])
  })

  it('an empty list clears any existing override for that (activity, attribute) pair', () => {
    let state = configReducer(start(), {
      type: 'setAttributeOptions',
      activityId: 'card-sleep',
      attributeType: 'quality',
      optionIds: ['Resonance'],
    })
    state = configReducer(state, { type: 'setAttributeOptions', activityId: 'card-sleep', attributeType: 'quality', optionIds: [] })
    expect(state.overrides).toEqual([])
  })

  it('replaces (not appends to) a previous override for the same pair', () => {
    let state = configReducer(start(), {
      type: 'setAttributeOptions',
      activityId: 'card-sleep',
      attributeType: 'quality',
      optionIds: ['Resonance'],
    })
    state = configReducer(state, {
      type: 'setAttributeOptions',
      activityId: 'card-sleep',
      attributeType: 'quality',
      optionIds: ['Flow'],
    })
    expect(state.overrides).toEqual([{ activityId: 'card-sleep', attributeType: 'quality', optionId: 'Flow' }])
    // Only the latest write for this pair is queued — no stale duplicate op.
    expect(state.pendingOps).toHaveLength(1)
  })

  it('never emits an override for a still-unsynced (temp) activity — defensive no-op', () => {
    let state = configReducer(start(), { type: 'selectCategory', id: 'sleep' })
    state = configReducer(state, { type: 'addActivity', name: 'New Habit', iconKey: 'Sparkle' })
    const tempId = state.activities.find((a) => a.name === 'New Habit')!.id
    const before = state
    state = configReducer(state, {
      type: 'setAttributeOptions',
      activityId: tempId,
      attributeType: 'flag',
      optionIds: ['Anger'],
    })
    expect(state).toBe(before)
  })

  it('two different attribute types on the same activity stay independent', () => {
    let state = configReducer(start(), {
      type: 'setAttributeOptions',
      activityId: 'card-sleep',
      attributeType: 'quality',
      optionIds: ['Resonance'],
    })
    state = configReducer(state, {
      type: 'setAttributeOptions',
      activityId: 'card-sleep',
      attributeType: 'flag',
      optionIds: ['Anger'],
    })
    expect(state.overrides).toEqual([
      { activityId: 'card-sleep', attributeType: 'quality', optionId: 'Resonance' },
      { activityId: 'card-sleep', attributeType: 'flag', optionId: 'Anger' },
    ])
  })
})
