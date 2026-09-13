import { describe, expect, it } from 'vitest'
import { ACTIVITY_CARDS, CATEGORIES, CATEGORY_ORDER, cardsForCategory, findCard, FLAGS, itemFillColor, QUALITIES } from './activities'

/**
 * Tile Redesign §3 — the per-tile item counts, in on-screen order. `sleep`
 * grew from 5 to 6 when the Sleep quick-log button's own catalog card
 * ('Sleep') was added (see the full-stack-engineer agent definition's
 * Quick-log/Supplements/Protein work) — a genuinely new card, not a
 * reclassification of an existing one. `nature` grew from 7 to 10 when
 * Prayer, Sermons and Worship were promoted from pure freeform-note header
 * pills to real quick-log catalog cards (same round that renamed Sleep's
 * "Night sleep" sub-type to "Main sleep") — three more genuinely new cards,
 * not a reclassification of `Spiritual Care` or anything else already here.
 */
const EXPECTED_TILE_COUNTS: Record<string, number> = {
  sleep: 6,
  food: 7,
  care: 5,
  downtime: 5,
  movement: 7,
  work: 5,
  nature: 10,
  growth: 7,
  home: 5,
}

const HEX = /^#[0-9a-fA-F]{6}$/

describe('the 57-item catalog', () => {
  it('has exactly 57 items total (6+7+5+5+7+5+10+7+5)', () => {
    expect(ACTIVITY_CARDS).toHaveLength(57)
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
    expect(total).toBe(57)
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

  it('Breathwork carries its 9 breath-type sub-options verbatim, in spec order', () => {
    const card = findCard('Breathwork')
    expect(card?.sub).toEqual(['Anulom Vilnulom', 'Sigh', 'Yawn', 'Slow', 'Deep', 'Hold', 'Pranayama', 'Omkaram', 'Brahmari'])
  })

  it('the Sleep quick-log card’s "Night sleep" sub-type is renamed to "Main sleep"', () => {
    const card = findCard('Sleep')
    expect(card?.sub).toEqual(['Main sleep', 'Nap', 'Power Nap'])
  })

  it('the unrelated, differently-capitalized "Night Sleep" top-level tile card is untouched by that rename', () => {
    const card = findCard('Night Sleep')
    expect(card).toBeDefined()
    expect(card?.categoryId).toBe('sleep')
    expect(card?.sub).toBeUndefined()
  })

  it('Prayer, Sermons and Worship are real, genuinely new nature-tile catalog cards (promoted from pure note-pill keys)', () => {
    const prayer = findCard('Prayer')
    const sermons = findCard('Sermons')
    const worship = findCard('Worship')
    expect(prayer?.categoryId).toBe('nature')
    expect(sermons?.categoryId).toBe('nature')
    expect(worship?.categoryId).toBe('nature')
  })

  it('Prayer carries the old note button’s 7-value type vocabulary verbatim, in the same order', () => {
    const card = findCard('Prayer')
    expect(card?.sub).toEqual([
      'Adoration',
      'Thanksgiving',
      'Repentance',
      'Seeking forgiveness',
      'Petition/Supplication',
      'Intercession',
      'Contemplation',
    ])
  })

  it('Sermons and Worship carry no sub list — neither has a type vocabulary', () => {
    expect(findCard('Sermons')?.sub).toBeUndefined()
    expect(findCard('Worship')?.sub).toBeUndefined()
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

describe('FLAGS ("Protective response", SCRUM-15 — 14-value option set)', () => {
  it('has exactly the 14 specified values, in spec order', () => {
    expect(FLAGS.map((f) => f.id)).toEqual([
      'Trauma Activation',
      'Triggered',
      'Attack',
      'Anger',
      'Procrastinated',
      'Shut Down',
      'Collapse',
      'Over Accommodating',
      'Hyper Responsibility',
      'Over Function',
      'Intellectualization',
      'Optimization',
      'Hyper Vigilance',
      'Problem Solving',
    ])
  })

  it('every flag has a distinct id', () => {
    const ids = FLAGS.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('QUALITIES ("Activity quality", SCRUM-10 — 18-value multi-select)', () => {
  it('has exactly the 18 specified values, in spec order', () => {
    expect(QUALITIES.map((q) => q.id)).toEqual([
      'Resonance',
      'Flow',
      'Scattered',
      'Overstimulated',
      'Zone out',
      'Numb',
      'Engaged',
      'Bored',
      'Resistant',
      'Frozen',
      'Avoiding',
      'Confusion',
      'Compulsive persistent',
      'Interoceptive Override',
      'Addictive',
      'Nourishing',
      'Draining',
      'Energizing',
    ])
  })

  it('every quality has a distinct icon assigned', () => {
    const icons = QUALITIES.map((q) => q.icon)
    expect(new Set(icons).size).toBe(icons.length)
  })
})
