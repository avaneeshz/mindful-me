import { describe, expect, it } from 'vitest'
import {
  activitiesForTile,
  activityNodeToCard,
  activityPathNames,
  buildActivityTree,
  collectSubtreeIds,
  isSiblingNameTaken,
  isTopLevelNameTaken,
  liveActivityCardsFromRows,
  liveCategoriesFromTiles,
  tileIdForActivity,
  type ActivityRow,
  type LiveTile,
} from './pickerHierarchy'

function row(partial: Partial<ActivityRow> & { id: string; name: string }): ActivityRow {
  return {
    tileId: null,
    parentId: null,
    iconKey: null,
    hidden: false,
    sortOrder: 0,
    disappearMode: 'manual',
    disappearLimit: null,
    ...partial,
  }
}

describe('buildActivityTree', () => {
  it('returns only the requested tile\'s top-level activities, sorted by sortOrder', () => {
    const rows: ActivityRow[] = [
      row({ id: 'b', name: 'B', tileId: 't1', sortOrder: 1 }),
      row({ id: 'a', name: 'A', tileId: 't1', sortOrder: 0 }),
      row({ id: 'other-tile', name: 'Other', tileId: 't2', sortOrder: 0 }),
    ]
    const tree = buildActivityTree(rows, 't1')
    expect(tree.map((n) => n.id)).toEqual(['a', 'b'])
  })

  it('nests children to arbitrary depth (top-level -> sub -> third -> fourth)', () => {
    const rows: ActivityRow[] = [
      row({ id: 'top', name: 'Top', tileId: 't1' }),
      row({ id: 'sub', name: 'Sub', parentId: 'top' }),
      row({ id: 'third', name: 'Third', parentId: 'sub' }),
      row({ id: 'fourth', name: 'Fourth', parentId: 'third' }),
    ]
    const tree = buildActivityTree(rows, 't1')
    expect(tree).toHaveLength(1)
    expect(tree[0].children[0].id).toBe('sub')
    expect(tree[0].children[0].children[0].id).toBe('third')
    expect(tree[0].children[0].children[0].children[0].id).toBe('fourth')
  })

  it('breaks a sortOrder tie by name', () => {
    const rows: ActivityRow[] = [
      row({ id: 'z', name: 'Zebra', tileId: 't1', sortOrder: 0 }),
      row({ id: 'a', name: 'Apple', tileId: 't1', sortOrder: 0 }),
    ]
    expect(buildActivityTree(rows, 't1').map((n) => n.id)).toEqual(['a', 'z'])
  })

  it('returns an empty array for a tile with no activities', () => {
    expect(buildActivityTree([], 't1')).toEqual([])
  })
})

describe('collectSubtreeIds', () => {
  it('includes the node itself and every descendant, to arbitrary depth', () => {
    const rows: ActivityRow[] = [
      row({ id: 'top', name: 'Top' }),
      row({ id: 'sub1', name: 'Sub1', parentId: 'top' }),
      row({ id: 'sub2', name: 'Sub2', parentId: 'top' }),
      row({ id: 'third', name: 'Third', parentId: 'sub1' }),
      row({ id: 'unrelated', name: 'Unrelated' }),
    ]
    const ids = collectSubtreeIds(rows, 'top')
    expect(new Set(ids)).toEqual(new Set(['top', 'sub1', 'sub2', 'third']))
    expect(ids).not.toContain('unrelated')
  })

  it('returns just the node for a leaf with no children', () => {
    const rows: ActivityRow[] = [row({ id: 'leaf', name: 'Leaf' })]
    expect(collectSubtreeIds(rows, 'leaf')).toEqual(['leaf'])
  })

  it('terminates instead of looping forever on a corrupted parentId cycle', () => {
    const rows: ActivityRow[] = [
      row({ id: 'a', name: 'A', parentId: 'b' }),
      row({ id: 'b', name: 'B', parentId: 'a' }),
    ]
    expect(new Set(collectSubtreeIds(rows, 'a'))).toEqual(new Set(['a', 'b']))
  })
})

describe('activityPathNames', () => {
  it('builds the full path from the top-level activity down to the target', () => {
    const rows: ActivityRow[] = [
      row({ id: 'top', name: 'Body Care (self)' }),
      row({ id: 'sub', name: 'Oiling', parentId: 'top' }),
      row({ id: 'third', name: 'Face', parentId: 'sub' }),
    ]
    expect(activityPathNames(rows, 'third')).toEqual(['Body Care (self)', 'Oiling', 'Face'])
  })

  it('returns an empty array for an unknown id', () => {
    expect(activityPathNames([], 'missing')).toEqual([])
  })

  it('returns a single-element path for a flat top-level activity', () => {
    const rows: ActivityRow[] = [row({ id: 'top', name: 'Walking' })]
    expect(activityPathNames(rows, 'top')).toEqual(['Walking'])
  })

  it('bails out instead of looping forever on a corrupted parentId cycle', () => {
    const rows: ActivityRow[] = [
      row({ id: 'a', name: 'A', parentId: 'b' }),
      row({ id: 'b', name: 'B', parentId: 'a' }),
    ]
    expect(() => activityPathNames(rows, 'a')).not.toThrow()
  })
})

describe('tileIdForActivity', () => {
  it("resolves a top-level activity's own tileId directly", () => {
    const rows: ActivityRow[] = [row({ id: 'top', name: 'Walk', tileId: 't1' })]
    expect(tileIdForActivity(rows, 'top')).toBe('t1')
  })

  it('walks parentId (by id, never by name) up to the root for a deeply nested activity', () => {
    const rows: ActivityRow[] = [
      row({ id: 'top', name: 'Body Care (self)', tileId: 't1' }),
      row({ id: 'sub', name: 'Oiling', parentId: 'top' }),
      row({ id: 'third', name: 'Face', parentId: 'sub' }),
    ]
    expect(tileIdForActivity(rows, 'third')).toBe('t1')
  })

  it('never gets confused by two DIFFERENT top-level activities sharing a name across two tiles (the exact bug this replaced a name-based lookup to fix)', () => {
    const rows: ActivityRow[] = [
      row({ id: 'walk-morning', name: 'Walk', tileId: 'morning' }),
      row({ id: 'walk-evening', name: 'Walk', tileId: 'evening' }),
      row({ id: 'walk-evening-sub', name: 'Loop', parentId: 'walk-evening' }),
    ]
    // A name-based lookup for "Walk" could resolve to either row — walking
    // by id from the SUB-activity's own real parentId must always resolve
    // to its OWN root, not whichever same-named row happens to come first.
    expect(tileIdForActivity(rows, 'walk-evening-sub')).toBe('evening')
    expect(tileIdForActivity(rows, 'walk-morning')).toBe('morning')
  })

  it('returns null for an unknown id', () => {
    expect(tileIdForActivity([], 'missing')).toBeNull()
  })

  it('returns null for a legacy shared-catalog root (no tileId of its own)', () => {
    const rows: ActivityRow[] = [row({ id: 'legacy', name: 'Night Sleep', tileId: null })]
    expect(tileIdForActivity(rows, 'legacy')).toBeNull()
  })

  it('bails out to null instead of looping forever on a corrupted parentId cycle', () => {
    const rows: ActivityRow[] = [
      row({ id: 'a', name: 'A', parentId: 'b' }),
      row({ id: 'b', name: 'B', parentId: 'a' }),
    ]
    expect(tileIdForActivity(rows, 'a')).toBeNull()
  })
})

describe('isTopLevelNameTaken', () => {
  it('is true when another top-level activity already has this exact name, even in a different tile', () => {
    const rows: ActivityRow[] = [
      row({ id: 'walk-morning', name: 'Walk', tileId: 'morning' }),
      row({ id: 'run-evening', name: 'Run', tileId: 'evening' }),
    ]
    expect(isTopLevelNameTaken(rows, 'Walk')).toBe(true)
    expect(isTopLevelNameTaken(rows, 'Swim')).toBe(false)
  })

  it('is true for a HIDDEN top-level activity\'s name too — hiding never frees up the name', () => {
    const rows: ActivityRow[] = [row({ id: 'walk', name: 'Walk', tileId: 'morning', hidden: true })]
    expect(isTopLevelNameTaken(rows, 'Walk')).toBe(true)
  })

  it('never counts a sub-activity\'s name as a top-level collision', () => {
    const rows: ActivityRow[] = [
      row({ id: 'top', name: 'Body Care (self)', tileId: 't1' }),
      row({ id: 'sub', name: 'Walk', parentId: 'top' }),
    ]
    expect(isTopLevelNameTaken(rows, 'Walk')).toBe(false)
  })

  it('excludes the activity being renamed from colliding with its own current name', () => {
    const rows: ActivityRow[] = [row({ id: 'walk', name: 'Walk', tileId: 'morning' })]
    expect(isTopLevelNameTaken(rows, 'Walk', 'walk')).toBe(false)
    expect(isTopLevelNameTaken(rows, 'Walk')).toBe(true)
  })

  it('trims the candidate name the same way the database does', () => {
    const rows: ActivityRow[] = [row({ id: 'walk', name: 'Walk', tileId: 'morning' })]
    expect(isTopLevelNameTaken(rows, '  Walk  ')).toBe(true)
  })

  it('is case-sensitive, matching the database\'s own exact-match uniqueness', () => {
    const rows: ActivityRow[] = [row({ id: 'walk', name: 'Walk', tileId: 'morning' })]
    expect(isTopLevelNameTaken(rows, 'walk')).toBe(false)
  })
})

describe('isSiblingNameTaken', () => {
  it('is true when another direct child of the same parent already has this exact name', () => {
    const rows: ActivityRow[] = [
      row({ id: 'top', name: 'Body Care (self)', tileId: 't1' }),
      row({ id: 'face', name: 'Face', parentId: 'top' }),
      row({ id: 'hands', name: 'Hands', parentId: 'top' }),
    ]
    expect(isSiblingNameTaken(rows, 'top', 'Face')).toBe(true)
    expect(isSiblingNameTaken(rows, 'top', 'Feet')).toBe(false)
  })

  it('never counts a same-named activity under a DIFFERENT parent as a collision', () => {
    const rows: ActivityRow[] = [
      row({ id: 'top-a', name: 'Body Care (self)', tileId: 't1' }),
      row({ id: 'top-b', name: 'Skincare', tileId: 't1' }),
      row({ id: 'face-a', name: 'Face', parentId: 'top-a' }),
    ]
    expect(isSiblingNameTaken(rows, 'top-b', 'Face')).toBe(false)
  })

  it('never counts a top-level activity\'s own name as a collision for a sibling check (different scope)', () => {
    const rows: ActivityRow[] = [
      row({ id: 'top', name: 'Walk', tileId: 't1' }),
      row({ id: 'sub', name: 'Loop', parentId: 'top' }),
    ]
    expect(isSiblingNameTaken(rows, 'top', 'Walk')).toBe(false)
  })

  it('excludes the activity being renamed from colliding with its own current name', () => {
    const rows: ActivityRow[] = [
      row({ id: 'top', name: 'Body Care (self)', tileId: 't1' }),
      row({ id: 'face', name: 'Face', parentId: 'top' }),
    ]
    expect(isSiblingNameTaken(rows, 'top', 'Face', 'face')).toBe(false)
    expect(isSiblingNameTaken(rows, 'top', 'Face')).toBe(true)
  })

  it('trims the candidate name the same way the database does', () => {
    const rows: ActivityRow[] = [
      row({ id: 'top', name: 'Body Care (self)', tileId: 't1' }),
      row({ id: 'face', name: 'Face', parentId: 'top' }),
    ]
    expect(isSiblingNameTaken(rows, 'top', '  Face  ')).toBe(true)
  })

  it('is case-sensitive, matching the database\'s own exact-match uniqueness', () => {
    const rows: ActivityRow[] = [
      row({ id: 'top', name: 'Body Care (self)', tileId: 't1' }),
      row({ id: 'face', name: 'Face', parentId: 'top' }),
    ]
    expect(isSiblingNameTaken(rows, 'top', 'face')).toBe(false)
  })
})

describe('activitiesForTile', () => {
  it('collects every descendant across all of a tile\'s top-level activities', () => {
    const rows: ActivityRow[] = [
      row({ id: 'top1', name: 'Top1', tileId: 't1' }),
      row({ id: 'top1-sub', name: 'Top1Sub', parentId: 'top1' }),
      row({ id: 'top2', name: 'Top2', tileId: 't1' }),
      row({ id: 'other-tile', name: 'Other', tileId: 't2' }),
    ]
    const ids = activitiesForTile(rows, 't1').map((r) => r.id)
    expect(new Set(ids)).toEqual(new Set(['top1', 'top1-sub', 'top2']))
  })

  it('returns an empty array for a tile with no activities', () => {
    expect(activitiesForTile([], 't1')).toEqual([])
  })
})

function tile(partial: Partial<LiveTile> & { id: string; label: string }): LiveTile {
  return { iconKey: 'Circle', hidden: false, sortOrder: 0, ...partial }
}

describe('liveCategoriesFromTiles', () => {
  it('excludes hidden tiles and sorts the rest by sortOrder', () => {
    const { order, categories } = liveCategoriesFromTiles([
      tile({ id: 'b', label: 'B', sortOrder: 1 }),
      tile({ id: 'hidden', label: 'Hidden', sortOrder: 0, hidden: true }),
      tile({ id: 'a', label: 'A', sortOrder: 0 }),
    ])
    expect(order).toEqual(['a', 'b'])
    expect(Object.keys(categories).sort()).toEqual(['a', 'b'])
    expect(categories.hidden).toBeUndefined()
  })

  it('returns an empty category record and order for no tiles', () => {
    expect(liveCategoriesFromTiles([])).toEqual({ categories: {}, order: [] })
  })

  it('carries the tile’s label/id through onto its Category', () => {
    const { categories } = liveCategoriesFromTiles([tile({ id: 't1', label: 'My Tile' })])
    expect(categories.t1.id).toBe('t1')
    expect(categories.t1.label).toBe('My Tile')
  })
})

describe('activityNodeToCard', () => {
  it('carries an auto disappear rule through when the node has both a mode and a positive limit', () => {
    const node = { id: 'a', name: 'A', tileId: 't1', parentId: null, iconKey: null, hidden: false, sortOrder: 0, disappearMode: 'auto' as const, disappearLimit: 2, children: [] }
    expect(activityNodeToCard(node, 't1').disappear).toEqual({ mode: 'auto', limit: 2 })
  })

  it('falls back to manual when disappearMode is auto but the limit is missing (defensive — the DB constraint should prevent this)', () => {
    const node = { id: 'a', name: 'A', tileId: 't1', parentId: null, iconKey: null, hidden: false, sortOrder: 0, disappearMode: 'auto' as const, disappearLimit: null, children: [] }
    expect(activityNodeToCard(node, 't1').disappear).toEqual({ mode: 'manual' })
  })

  it('a leaf node (no children) produces a card with children: undefined, not an empty array', () => {
    const node = { id: 'a', name: 'A', tileId: 't1', parentId: null, iconKey: null, hidden: false, sortOrder: 0, disappearMode: 'manual' as const, disappearLimit: null, children: [] }
    expect(activityNodeToCard(node, 't1').children).toBeUndefined()
  })

  it('recurses through children to arbitrary depth', () => {
    const node = {
      id: 'top', name: 'Top', tileId: 't1', parentId: null, iconKey: null, hidden: false, sortOrder: 0,
      disappearMode: 'manual' as const, disappearLimit: null,
      children: [
        {
          id: 'sub', name: 'Sub', tileId: null, parentId: 'top', iconKey: null, hidden: false, sortOrder: 0,
          disappearMode: 'manual' as const, disappearLimit: null,
          children: [
            { id: 'third', name: 'Third', tileId: null, parentId: 'sub', iconKey: null, hidden: false, sortOrder: 0, disappearMode: 'manual' as const, disappearLimit: null, children: [] },
          ],
        },
      ],
    }
    const card = activityNodeToCard(node, 't1')
    expect(card.children?.[0].name).toBe('Sub')
    expect(card.children?.[0].children?.[0].name).toBe('Third')
    expect(card.children?.[0].children?.[0].children).toBeUndefined()
  })
})

describe('liveActivityCardsFromRows', () => {
  it('excludes a hidden top-level activity and everything under it', () => {
    const rows: ActivityRow[] = [
      row({ id: 'visible', name: 'Visible', tileId: 't1' }),
      row({ id: 'hidden-top', name: 'HiddenTop', tileId: 't1', hidden: true }),
      row({ id: 'hidden-sub', name: 'HiddenSub', parentId: 'hidden-top' }),
    ]
    const cards = liveActivityCardsFromRows(rows, ['t1'])
    expect(cards.map((c) => c.name)).toEqual(['Visible'])
  })

  it('orders cards by tile order, top-level items within a tile by sortOrder', () => {
    const rows: ActivityRow[] = [
      row({ id: 'a2', name: 'A2', tileId: 't2', sortOrder: 0 }),
      row({ id: 'a1b', name: 'A1B', tileId: 't1', sortOrder: 1 }),
      row({ id: 'a1a', name: 'A1A', tileId: 't1', sortOrder: 0 }),
    ]
    const cards = liveActivityCardsFromRows(rows, ['t1', 't2'])
    expect(cards.map((c) => c.name)).toEqual(['A1A', 'A1B', 'A2'])
  })

  it('produces an arbitrary-depth children tree per card, matching buildActivityTree', () => {
    const rows: ActivityRow[] = [
      row({ id: 'top', name: 'Top', tileId: 't1' }),
      row({ id: 'sub', name: 'Sub', parentId: 'top' }),
      row({ id: 'third', name: 'Third', parentId: 'sub' }),
      row({ id: 'fourth', name: 'Fourth', parentId: 'third' }),
    ]
    const cards = liveActivityCardsFromRows(rows, ['t1'])
    expect(cards).toHaveLength(1)
    const top = cards[0]
    expect(top.children?.[0].name).toBe('Sub')
    expect(top.children?.[0].children?.[0].name).toBe('Third')
    expect(top.children?.[0].children?.[0].children?.[0].name).toBe('Fourth')
    expect(top.children?.[0].children?.[0].children?.[0].children).toBeUndefined()
  })
})
