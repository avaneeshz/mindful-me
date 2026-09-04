import { describe, expect, it } from 'vitest'
import { computePanelGeometry, computePanelWidth } from './panelGeometry'

describe('computePanelWidth', () => {
  it('fits exactly N cards at their real width and gap, plus padding', () => {
    // 5 cards: 5*92 + 4*12 + 32 = 460 + 48 + 32 = 540
    expect(computePanelWidth(5, 1000)).toBe(540)
    // 7 cards: 7*92 + 6*12 + 32 = 644 + 72 + 32 = 748
    expect(computePanelWidth(7, 1000)).toBe(748)
  })

  it('a narrower category gets a narrower panel than a wider one', () => {
    expect(computePanelWidth(4, 1000)).toBeLessThan(computePanelWidth(7, 1000))
  })

  it('caps to the row width — never wider than the row itself', () => {
    expect(computePanelWidth(7, 400)).toBe(400)
  })

  it('one item still gets a sensible width (no negative gap term)', () => {
    // 1*92 + 0*12 + 32 = 124
    expect(computePanelWidth(1, 1000)).toBe(124)
  })

  it('zero items is zero width, not a negative or NaN', () => {
    expect(computePanelWidth(0, 1000)).toBe(0)
  })
})

describe('computePanelGeometry — anchoring', () => {
  const base = { tileCount: 9, tileWidth: 100, rowWidth: 1000, itemCount: 5 }
  const width = computePanelWidth(5, 1000) // 540

  it('tiles before the middle (0..3 of 9) anchor the panel LEFT edge to the tile', () => {
    for (const tileIndex of [0, 1, 2, 3]) {
      const tileLeft = tileIndex * 100
      const geometry = computePanelGeometry({ ...base, tileIndex, tileLeft })
      expect(geometry.marginLeft).toBe(tileLeft)
      expect(geometry.width).toBe(width)
    }
  })

  it('the middle tile (4 of 9) centers the panel under it', () => {
    const tileLeft = 400
    const geometry = computePanelGeometry({ ...base, tileIndex: 4, tileLeft })
    expect(geometry.marginLeft).toBe(tileLeft + 100 / 2 - width / 2)
  })

  it('tiles after the middle (5..8 of 9) anchor the panel RIGHT edge to the tile', () => {
    for (const tileIndex of [5, 6, 7, 8]) {
      const tileLeft = tileIndex * 100
      const geometry = computePanelGeometry({ ...base, tileIndex, tileLeft })
      expect(geometry.marginLeft).toBe(tileLeft + 100 - width)
    }
  })

  it('clamps marginLeft so a left-anchored panel near the row start never goes negative', () => {
    const geometry = computePanelGeometry({ ...base, tileIndex: 0, tileLeft: 0 })
    expect(geometry.marginLeft).toBe(0)
  })

  it('clamps marginLeft so a right-anchored panel near the row end never overflows it', () => {
    // Last tile sits flush against the row's own right edge.
    const geometry = computePanelGeometry({ ...base, tileIndex: 8, tileLeft: 900, tileWidth: 100 })
    expect(geometry.marginLeft).toBe(1000 - width)
    expect(geometry.marginLeft + geometry.width).toBeLessThanOrEqual(1000)
  })

  it('a wide panel that would overflow a narrow row is clamped fully on-screen either direction', () => {
    // itemCount 7 wants 748px; row is only 500px wide.
    const narrow = { tileCount: 9, tileWidth: 50, rowWidth: 500, itemCount: 7 }
    const left = computePanelGeometry({ ...narrow, tileIndex: 0, tileLeft: 0 })
    expect(left.width).toBe(500)
    expect(left.marginLeft).toBe(0)
    const right = computePanelGeometry({ ...narrow, tileIndex: 8, tileLeft: 450 })
    expect(right.marginLeft).toBe(0)
    expect(right.marginLeft + right.width).toBeLessThanOrEqual(500)
  })
})

describe('computePanelGeometry — chevron', () => {
  const base = { tileCount: 9, tileWidth: 100, rowWidth: 1000, itemCount: 5 }

  it('points at the tapped tile\'s own horizontal center, relative to the panel', () => {
    // Tile 2 (left-anchored): panel starts at tile's own left edge, so the
    // chevron should sit at exactly the tile's half-width in.
    const geometry = computePanelGeometry({ ...base, tileIndex: 2, tileLeft: 200 })
    expect(geometry.chevronLeft).toBe(50) // tileWidth / 2
  })

  it('stays clamped inside the panel bounds even for an edge tile', () => {
    const width = computePanelWidth(5, 1000)
    const geometry = computePanelGeometry({ ...base, tileIndex: 0, tileLeft: 0 })
    expect(geometry.chevronLeft).toBeGreaterThanOrEqual(14)
    expect(geometry.chevronLeft).toBeLessThanOrEqual(width - 14)
  })

  it('tracks the middle tile correctly when the panel is centered under it', () => {
    const geometry = computePanelGeometry({ ...base, tileIndex: 4, tileLeft: 400 })
    // Panel is centered on the tile, so the chevron should land at the
    // panel's own horizontal center.
    expect(geometry.chevronLeft).toBeCloseTo(geometry.width / 2, 5)
  })
})
