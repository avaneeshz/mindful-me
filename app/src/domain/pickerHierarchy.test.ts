import { describe, expect, it } from 'vitest'
import {
  activitiesForTile,
  activityPathNames,
  buildActivityTree,
  collectSubtreeIds,
  type ActivityRow,
} from './pickerHierarchy'

function row(partial: Partial<ActivityRow> & { id: string; name: string }): ActivityRow {
  return {
    tileId: null,
    parentId: null,
    iconKey: null,
    hidden: false,
    sortOrder: 0,
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
