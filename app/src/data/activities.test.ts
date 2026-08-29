import { describe, expect, it } from 'vitest'
import { ACTIVITY_CARDS, CATEGORIES, CATEGORY_ORDER, cardsForCategory, findCard, itemFillColor } from './activities'

/** Tile Redesign §3 — the per-tile item counts, in on-screen order. */
const EXPECTED_TILE_COUNTS: Record<string, number> = {
  sleep: 5,
  food: 7,
  care: 5,
  downtime: 5,
  movement: 7,
  work: 5,
  nature: 7,
  growth: 7,
  home: 5,
}

const HEX = /^#[0-9a-fA-F]{6}$/

describe('the 53-item catalog', () => {
  it('has exactly 53 items total (5+7+5+5+7+5+7+7+5)', () => {
    expect(ACTIVITY_CARDS).toHaveLength(53)
  })

  it('has exactly 9 tiles, in the documented on-screen order', () => {
    expect(CATEGORY_ORDER).toHaveLength(9)
    expect(Object.keys(CATEGORIES).sort()).toEqual([...CATEGORY_ORDER].sort())
  })

  it('matches the spec’s exact per-tile item count for every tile', () => {
    for (const categoryId of CATEGORY_ORDER) {
      expect(cardsForCategory(categoryId), categoryId).toHaveLength(EXPECTED_TILE_COUNTS[categoryId])
    }
    const total = CATEGORY_ORDER.reduce((sum, id) => sum + cardsForCategory(id).length, 0)
    expect(total).toBe(53)
  })

  it('has no duplicate item names', () => {
    const names = ACTIVITY_CARDS.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('every item resolves through findCard by its own name', () => {
    for (const card of ACTIVITY_CARDS) {
      expect(findCard(card.name)).toBe(card)
    }
  })

  it('every item names a real tile', () => {
    for (const card of ACTIVITY_CARDS) {
      expect(CATEGORY_ORDER, card.name).toContain(card.categoryId)
    }
  })

  it('every item and tile fill is a plain 6-digit hex or a CSS var — never a gradient', () => {
    for (const category of Object.values(CATEGORIES)) {
      expect(category.deep).toMatch(/^var\(--cat-[a-z]+-deep\)$/)
      expect(category.light).toMatch(/^var\(--cat-[a-z]+-light\)$/)
    }
    for (const card of ACTIVITY_CARDS) {
      expect(card.color, card.name).toMatch(HEX)
    }
  })

  it('every disappear rule is either auto with a positive limit, or manual', () => {
    for (const card of ACTIVITY_CARDS) {
      if (card.disappear.mode === 'auto') {
        expect(card.disappear.limit, card.name).toBeGreaterThan(0)
      } else {
        expect(card.disappear.mode, card.name).toBe('manual')
      }
    }
  })

  it('"Body Care (self)" is the only item with a true 3-level (sub + third) drill', () => {
    const threeLevel = ACTIVITY_CARDS.filter((c) => c.third)
    expect(threeLevel.map((c) => c.name)).toEqual(['Body Care (self)'])
  })

  it('Body Care (self) reuses the old "Body care" sub/third structure verbatim', () => {
    const card = findCard('Body Care (self)')
    expect(card?.sub).toEqual(['Massage', 'Oiling', 'Mask'])
    expect(card?.third).toEqual({
      Massage: ['Face', 'Body', 'Hair'],
      Oiling: ['Face', 'Body', 'Hair'],
      Mask: ['Face', 'Body', 'Hair'],
    })
  })

  it('the old "Nature connect" wrapper is fully dissolved — no card by that name', () => {
    expect(findCard('Nature connect')).toBeUndefined()
  })
})

describe('itemFillColor', () => {
  it('returns the item’s own colour for a known card', () => {
    expect(itemFillColor('Night Sleep')).toBe(findCard('Night Sleep')!.color)
  })

  it('falls back to the tile’s light tone for an unknown/stale name', () => {
    expect(itemFillColor('Some Retired Activity')).toBe('var(--cat-sleep-light)')
  })

  it('falls back the same way for null (defensive — flags never reach this path in practice)', () => {
    expect(itemFillColor(null)).toBe('var(--cat-sleep-light)')
  })
})
