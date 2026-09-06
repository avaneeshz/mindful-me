import { describe, expect, it } from 'vitest'
import { MIN_TILE_WIDTH_PX, TILE_GAP_PX, tileRowCount, tileRowGridTemplate, tilesPerRow } from './tileLayout'

describe('tilesPerRow', () => {
  it('fits all 9 tiles in one row at a typical desktop width', () => {
    expect(tilesPerRow(1200, 9)).toBe(9)
  })

  it('never returns more columns than there are tiles, however wide the container', () => {
    expect(tilesPerRow(4000, 3)).toBe(3)
  })

  it('wraps to fewer columns per row on a narrow (mobile) width rather than squeezing every tile', () => {
    // 9 tiles at the 64px minimum + 12px gaps need 9*64 + 8*12 = 672px.
    const perRow = tilesPerRow(375, 9)
    expect(perRow).toBeLessThan(9)
    expect(perRow).toBeGreaterThanOrEqual(1)
  })

  it('always gives at least 1 column, even for an absurdly narrow container', () => {
    expect(tilesPerRow(10, 9)).toBe(1)
    expect(tilesPerRow(0, 9)).toBe(1)
  })

  it('returns 0 for an empty catalog — no tiles, no columns', () => {
    expect(tilesPerRow(1200, 0)).toBe(0)
  })

  it('fits exactly the number of columns the min-width/gap arithmetic allows', () => {
    // width = n*MIN + (n-1)*GAP  =>  for n=5: 5*64 + 4*12 = 368
    const width = 5 * MIN_TILE_WIDTH_PX + 4 * TILE_GAP_PX
    expect(tilesPerRow(width, 20)).toBe(5)
    // One pixel short must drop to 4.
    expect(tilesPerRow(width - 1, 20)).toBe(4)
  })

  it('generalizes beyond the historical fixed count of 9 — more tiles just wrap more', () => {
    expect(tilesPerRow(1200, 20)).toBeLessThanOrEqual(20)
    expect(tilesPerRow(1200, 20)).toBeGreaterThan(0)
  })
})

describe('tileRowCount', () => {
  it('is 1 row when every tile fits in the available columns', () => {
    expect(tileRowCount(9, 9)).toBe(1)
    expect(tileRowCount(5, 9)).toBe(1)
  })

  it('wraps into multiple rows once tiles exceed one row’s capacity', () => {
    expect(tileRowCount(9, 4)).toBe(3)
    expect(tileRowCount(10, 4)).toBe(3)
  })

  it('is 0 for zero tiles or zero columns per row', () => {
    expect(tileRowCount(0, 4)).toBe(0)
    expect(tileRowCount(9, 0)).toBe(0)
  })
})

describe('tileRowGridTemplate', () => {
  it('names the exact minmax value TileRow.tsx renders, so the two can never drift apart', () => {
    expect(tileRowGridTemplate()).toBe(`repeat(auto-fit, minmax(${MIN_TILE_WIDTH_PX}px, 1fr))`)
  })
})
