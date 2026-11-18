import { describe, expect, it } from 'vitest'
import { DEFAULT_CARD_ORDER } from '@/domain/reflectionCardOrder'
import {
  addCardGroup,
  addCardToGroup,
  applyCardLayout,
  cardLayout,
  defaultCardGroups,
  deleteCardGroup,
  flattenCardGroups,
  moveCardGroup,
  moveCardToGroup,
  normalizeCardGroups,
  renameCardGroup,
} from '@/domain/reflectionCardGroups'

const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1)
const two = () => [
  { id: 'a', name: 'Calm', cards: ids(9) },
  { id: 'b', name: 'Low', cards: [10, 11, 12, 13, 14, 15, 16, 17, 18] },
]

describe('normalizeCardGroups', () => {
  it('gives one default category holding every tile when nothing is stored', () => {
    const groups = normalizeCardGroups(undefined, DEFAULT_CARD_ORDER)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.cards).toEqual(ids(18))
  })

  it('keeps a valid layout as it is', () => {
    expect(normalizeCardGroups(two(), DEFAULT_CARD_ORDER)).toEqual(two())
  })

  it('drops unknown, duplicate and malformed entries, and appends any missing tile to the first category', () => {
    const stored = [
      { id: 'a', name: 'Calm', cards: [1, 2, 2, 99, 'x', 3] },
      { id: 'a', name: 'Dup id', cards: [4] },
      { id: 'b', name: '  ', cards: [5] },
      { id: 'c', name: 'Low', cards: [3, 6] },
      null,
    ]
    const groups = normalizeCardGroups(stored, DEFAULT_CARD_ORDER)
    expect(groups.map((g) => g.id)).toEqual(['a', 'c'])
    expect(groups[1]!.cards).toEqual([6])
    expect(flattenCardGroups(groups).sort((x, y) => x - y)).toEqual(ids(18))
    expect(groups[0]!.cards.slice(0, 3)).toEqual([1, 2, 3])
  })

  it('includes the account’s own tiles', () => {
    const groups = normalizeCardGroups(two(), DEFAULT_CARD_ORDER, [19, 20])
    expect(flattenCardGroups(groups)).toContain(19)
    expect(groups[0]!.cards.slice(-2)).toEqual([19, 20])
  })
})

describe('layout', () => {
  it('lists each category’s shown tiles as strings, without the hidden ones', () => {
    expect(cardLayout(two(), [1, 10])[0]!.buttonIds[0]).toBe('2')
    expect(cardLayout(two(), [10])[1]!.buttonIds).not.toContain('10')
  })

  it('applies a drag across categories and keeps hidden tiles in their own category', () => {
    const next = applyCardLayout(two(), [10], [
      { groupId: 'a', buttonIds: ['11', ...ids(9).map(String)] },
      { groupId: 'b', buttonIds: ['12', '13', '14', '15', '16', '17', '18'] },
    ])
    expect(next[0]!.cards[0]).toBe(11)
    expect(next[1]!.cards).toEqual([12, 13, 14, 15, 16, 17, 18, 10])
    expect(flattenCardGroups(next).sort((x, y) => x - y)).toEqual(ids(18))
  })

  it('never loses a tile the layout forgot to mention', () => {
    const next = applyCardLayout(two(), [], [{ groupId: 'a', buttonIds: ['1', '2'] }])
    expect(flattenCardGroups(next).sort((x, y) => x - y)).toEqual(ids(18))
  })
})

describe('category edits', () => {
  it('moves a tile to the end of another category', () => {
    const next = moveCardToGroup(two(), 1, 'b')
    expect(next[0]!.cards).not.toContain(1)
    expect(next[1]!.cards.at(-1)).toBe(1)
  })

  it('adds a new tile to the chosen category, or the first when unknown', () => {
    expect(addCardToGroup(two(), 19, 'b')[1]!.cards.at(-1)).toBe(19)
    expect(addCardToGroup(two(), 19, 'nope')[0]!.cards.at(-1)).toBe(19)
  })

  it('adds, renames and reorders categories', () => {
    const added = addCardGroup(two(), 'c', '  Joy ')
    expect(added[2]).toEqual({ id: 'c', name: 'Joy', cards: [] })
    expect(renameCardGroup(added, 'c', 'Bright')[2]!.name).toBe('Bright')
    expect(moveCardGroup(added, 'c', -1).map((g) => g.id)).toEqual(['a', 'c', 'b'])
    expect(moveCardGroup(added, 'a', -1).map((g) => g.id)).toEqual(['a', 'b', 'c'])
  })

  it('deleting a category moves its tiles to the target and never deletes tiles', () => {
    const next = deleteCardGroup(two(), 'a', 'b')
    expect(next).toHaveLength(1)
    expect(next[0]!.cards).toHaveLength(18)
    expect(deleteCardGroup(defaultCardGroups(ids(18)), 'default')).toHaveLength(1)
  })
})
