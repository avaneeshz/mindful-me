import { describe, expect, it } from 'vitest'
import { CATEGORIES, CATEGORY_ORDER } from '@/data/activities'
import {
  buildAttributeOverrideMap,
  buildSnapshotFromRows,
  cardsForCategoryIn,
  defaultCatalogRows,
  defaultCatalogSnapshot,
  filterMasterOptions,
  findCardIn,
  overridesFor,
  type CatalogActivityRow,
  type CatalogCategoryRow,
  type AttributeOverrideRow,
} from './catalog'

describe('defaultCatalogSnapshot', () => {
  it('carries the exact same 9 tiles, in the exact same order, as data/activities.ts', () => {
    const snapshot = defaultCatalogSnapshot()
    expect(snapshot.categoryOrder).toEqual(CATEGORY_ORDER)
    for (const id of CATEGORY_ORDER) {
      expect(snapshot.categories[id].label).toBe(CATEGORIES[id].label)
    }
  })

  it('finds every card by name, same as the static findCard', () => {
    const snapshot = defaultCatalogSnapshot()
    expect(findCardIn(snapshot, 'Night Sleep')?.categoryId).toBe('sleep')
    expect(findCardIn(snapshot, 'Body Care (self)')?.third).toEqual({
      Massage: ['Face', 'Body', 'Hair'],
      Oiling: ['Face', 'Body', 'Hair'],
      Mask: ['Face', 'Body', 'Hair'],
    })
  })

  it('is memoized — repeated calls return the identical object', () => {
    expect(defaultCatalogSnapshot()).toBe(defaultCatalogSnapshot())
  })
})

describe('defaultCatalogRows', () => {
  it('produces exactly the same 9 tile ids the real catalog_categories seed migration uses', () => {
    const { categories } = defaultCatalogRows()
    expect(categories.map((c) => c.id).sort()).toEqual([...CATEGORY_ORDER].sort())
    expect(categories.every((c) => c.isActive)).toBe(true)
  })

  it('round-trips through buildSnapshotFromRows back to the same effective catalog defaultCatalogSnapshot describes', () => {
    const { categories, activities } = defaultCatalogRows()
    const rebuilt = buildSnapshotFromRows(categories, activities)
    const direct = defaultCatalogSnapshot()
    expect(rebuilt.categoryOrder).toEqual(direct.categoryOrder)
    expect(rebuilt.cards.map((c) => c.name).sort()).toEqual(direct.cards.map((c) => c.name).sort())
    expect(findCardIn(rebuilt, 'Body Care (self)')?.third).toEqual(findCardIn(direct, 'Body Care (self)')?.third)
  })

  it('every activity row id is unique — no sub/third slug collision across different cards', () => {
    const { activities } = defaultCatalogRows()
    const ids = activities.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('is memoized — repeated calls return the identical object', () => {
    expect(defaultCatalogRows()).toBe(defaultCatalogRows())
  })
})

describe('buildSnapshotFromRows', () => {
  const categories: CatalogCategoryRow[] = [
    { id: 'sleep', label: 'Sleep & Rest', iconKey: 'Moon', sortOrder: 0, isActive: true },
    { id: 'custom', label: 'My New Tile', iconKey: 'Sparkles', sortOrder: 1, isActive: true },
    { id: 'hidden', label: 'Hidden Tile', iconKey: 'Home', sortOrder: 2, isActive: false },
  ]

  it('excludes an inactive (soft-deleted) tile from categoryOrder entirely', () => {
    const snapshot = buildSnapshotFromRows(categories, [])
    expect(snapshot.categoryOrder).toEqual(['sleep', 'custom'])
    expect(snapshot.categories.hidden).toBeUndefined()
  })

  it('orders active tiles by sort_order, not array/insertion order', () => {
    const shuffled = [categories[1], categories[0]]
    const snapshot = buildSnapshotFromRows(shuffled, [])
    expect(snapshot.categoryOrder).toEqual(['sleep', 'custom'])
  })

  it('collapses a 3-level tree (card -> sub -> third) into the flat sub/third shape', () => {
    const activities: CatalogActivityRow[] = [
      { id: 'card1', name: 'Body Care (self)', categoryId: 'sleep', parentId: null, iconKey: 'Droplet', sortOrder: 0, isActive: true },
      { id: 'sub1', name: 'Massage', categoryId: null, parentId: 'card1', iconKey: 'Droplet', sortOrder: 0, isActive: true },
      { id: 'third1', name: 'Face', categoryId: null, parentId: 'sub1', iconKey: 'Droplet', sortOrder: 0, isActive: true },
      { id: 'third2', name: 'Body', categoryId: null, parentId: 'sub1', iconKey: 'Droplet', sortOrder: 1, isActive: true },
    ]
    const snapshot = buildSnapshotFromRows(categories, activities)
    const card = findCardIn(snapshot, 'Body Care (self)')
    expect(card?.sub).toEqual(['Massage'])
    expect(card?.third).toEqual({ Massage: ['Face', 'Body'] })
  })

  it('gives a plain top-level card (no children) neither sub nor third', () => {
    const activities: CatalogActivityRow[] = [
      { id: 'card1', name: 'Night Sleep', categoryId: 'sleep', parentId: null, iconKey: 'Moon', sortOrder: 0, isActive: true },
    ]
    const snapshot = buildSnapshotFromRows(categories, activities)
    const card = findCardIn(snapshot, 'Night Sleep')
    expect(card?.sub).toBeUndefined()
    expect(card?.third).toBeUndefined()
  })

  it('drops an inactive card from the snapshot, and its own children with it', () => {
    const activities: CatalogActivityRow[] = [
      { id: 'card1', name: 'Retired Card', categoryId: 'sleep', parentId: null, iconKey: 'Moon', sortOrder: 0, isActive: false },
      { id: 'sub1', name: 'Still Active Sub', categoryId: null, parentId: 'card1', iconKey: 'Moon', sortOrder: 0, isActive: true },
    ]
    const snapshot = buildSnapshotFromRows(categories, activities)
    expect(findCardIn(snapshot, 'Retired Card')).toBeUndefined()
  })

  it('drops a top-level card whose category was itself deactivated', () => {
    const activities: CatalogActivityRow[] = [
      { id: 'card1', name: 'Orphaned Card', categoryId: 'hidden', parentId: null, iconKey: 'Home', sortOrder: 0, isActive: true },
    ]
    const snapshot = buildSnapshotFromRows(categories, activities)
    expect(findCardIn(snapshot, 'Orphaned Card')).toBeUndefined()
  })

  it('a brand-new (user-added) top-level card defaults to a manual disappear rule', () => {
    const activities: CatalogActivityRow[] = [
      { id: 'card1', name: 'My New Habit', categoryId: 'custom', parentId: null, iconKey: 'Sparkles', sortOrder: 0, isActive: true },
    ]
    const snapshot = buildSnapshotFromRows(categories, activities)
    expect(findCardIn(snapshot, 'My New Habit')?.disappear).toEqual({ mode: 'manual' })
  })

  it('a system card name keeps its data/activities.ts disappear rule', () => {
    const activities: CatalogActivityRow[] = [
      { id: 'card1', name: 'Night Sleep', categoryId: 'sleep', parentId: null, iconKey: 'Moon', sortOrder: 0, isActive: true },
    ]
    const snapshot = buildSnapshotFromRows(categories, activities)
    expect(findCardIn(snapshot, 'Night Sleep')?.disappear).toEqual({ mode: 'auto', limit: 1 })
  })

  it('cardsForCategoryIn returns only that tile’s own active cards', () => {
    const activities: CatalogActivityRow[] = [
      { id: 'c1', name: 'Night Sleep', categoryId: 'sleep', parentId: null, iconKey: 'Moon', sortOrder: 0, isActive: true },
      { id: 'c2', name: 'My New Habit', categoryId: 'custom', parentId: null, iconKey: 'Sparkles', sortOrder: 0, isActive: true },
    ]
    const snapshot = buildSnapshotFromRows(categories, activities)
    expect(cardsForCategoryIn(snapshot, 'sleep').map((c) => c.name)).toEqual(['Night Sleep'])
    expect(cardsForCategoryIn(snapshot, 'custom').map((c) => c.name)).toEqual(['My New Habit'])
  })
})

describe('buildAttributeOverrideMap', () => {
  const activities: CatalogActivityRow[] = [
    { id: 'card1', name: 'Night Sleep', categoryId: 'sleep', parentId: null, iconKey: 'Moon', sortOrder: 0, isActive: true },
  ]

  it('keys overrides by activity NAME, not the DB id', () => {
    const overrides: AttributeOverrideRow[] = [
      { activityId: 'card1', attributeType: 'quality', optionId: 'Resonance' },
      { activityId: 'card1', attributeType: 'quality', optionId: 'Flow' },
    ]
    const map = buildAttributeOverrideMap(activities, overrides)
    expect(map['Night Sleep'].quality).toEqual(['Resonance', 'Flow'])
    expect(overridesFor(map, 'Night Sleep', 'quality')).toEqual(['Resonance', 'Flow'])
  })

  it('ignores an override row whose activity_id no longer resolves to any active card', () => {
    const overrides: AttributeOverrideRow[] = [{ activityId: 'ghost', attributeType: 'flag', optionId: 'Anger' }]
    const map = buildAttributeOverrideMap(activities, overrides)
    expect(map).toEqual({})
  })

  it('a card with no override rows has no entry at all — "show everything"', () => {
    const map = buildAttributeOverrideMap(activities, [])
    expect(overridesFor(map, 'Night Sleep', 'quality')).toBeUndefined()
  })
})

describe('filterMasterOptions', () => {
  const master = ['Resonance', 'Flow', 'Scattered'] as const

  it('returns the full master list untouched when there is no allow-list', () => {
    expect(filterMasterOptions(master, undefined)).toEqual(['Resonance', 'Flow', 'Scattered'])
    expect(filterMasterOptions(master, [])).toEqual(['Resonance', 'Flow', 'Scattered'])
  })

  it('keeps only the allow-listed ids, in the MASTER list’s own order (not the allow-list’s)', () => {
    expect(filterMasterOptions(master, ['Scattered', 'Resonance'])).toEqual(['Resonance', 'Scattered'])
  })

  it('drops an allow-listed id that no longer names a real master option', () => {
    expect(filterMasterOptions(master, ['Resonance', 'NotReal'])).toEqual(['Resonance'])
  })

  it('an allow-list of only unknown ids empties the list — never silently falls back to "show all"', () => {
    expect(filterMasterOptions(master, ['NotReal'])).toEqual([])
  })
})
