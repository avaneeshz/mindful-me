/**
 * Pure geometry for the tile row's expand panel (Section B) — anchoring,
 * dynamic width, and the chevron's x position. No React, no DOM: the
 * component (`TileRow.tsx`) measures real pixel rects via `getBoundingClientRect`
 * (untestable in this SSR-string test suite, same as the duration drag-block's
 * real pointer math) and hands them to these functions, which is where the
 * actual placement logic — and its test coverage — lives.
 *
 * Anchoring, exactly as the reference implementation: with 9 tiles indexed
 * 0..8, tiles 0..3 (the row's first 4) anchor the panel's LEFT edge to the
 * tapped tile's own left edge; tile 4 (the middle one) CENTERS the panel
 * under it; tiles 5..8 (the last 4) anchor the panel's RIGHT edge to the
 * tapped tile's own right edge. Generalized to any tile count via
 * `Math.floor(tileCount / 2)` rather than hardcoding 4, so it still makes
 * sense if the catalog ever grows past 9 categories.
 */

export const ITEM_CARD_WIDTH = 92
export const ITEM_CHIP_GAP = 12
/** `px-lg` (16px) on both sides of the panel — matches the reference's own padding. */
export const PANEL_PADDING_X = 32
/** How close the chevron may sit to either edge of the panel's own bounds. */
export const CHEVRON_EDGE_INSET = 14

/**
 * The panel's width: exactly enough to fit `itemCount` cards at their real
 * size and gap, plus the panel's own padding — never more, never padded out
 * to fill the row. Capped to `rowWidth` so it can never overflow the tile
 * row's own bounds even for a category with many items.
 */
export function computePanelWidth(itemCount: number, rowWidth: number): number {
  if (itemCount <= 0) return 0
  const natural = itemCount * ITEM_CARD_WIDTH + (itemCount - 1) * ITEM_CHIP_GAP + PANEL_PADDING_X
  return Math.min(natural, rowWidth)
}

export interface PanelGeometry {
  /** The panel's own width, in px. */
  width: number
  /** Left offset from the row's own left edge, in px — a real CSS margin, not `position: absolute`. */
  marginLeft: number
  /** The chevron's `left` position, in px, relative to the panel's own left edge. */
  chevronLeft: number
}

export interface PanelGeometryInput {
  /** 0-based index of the tapped tile within the row. */
  tileIndex: number
  /** Total tiles in the row (9, but never hardcoded below). */
  tileCount: number
  /** The tapped tile's own left edge, relative to the row's left edge, in px. */
  tileLeft: number
  /** The tapped tile's own width, in px. */
  tileWidth: number
  /** The full row's own width, in px — the width cap and the clamp bound below. */
  rowWidth: number
  itemCount: number
}

/**
 * Where the panel sits (width + left margin) and where its chevron points,
 * for one tapped tile. `marginLeft` is always clamped into `[0, rowWidth -
 * width]` — even a left/right-anchored panel near either end of the row
 * never runs past it — and `chevronLeft` is independently clamped to stay
 * inside the panel's own bounds (`CHEVRON_EDGE_INSET` from either edge), so
 * it keeps pointing at the tapped tile even when the panel itself had to
 * shift to stay on-screen.
 */
export function computePanelGeometry(input: PanelGeometryInput): PanelGeometry {
  const { tileIndex, tileCount, tileLeft, tileWidth, rowWidth, itemCount } = input
  const width = computePanelWidth(itemCount, rowWidth)
  const middleIndex = Math.floor(tileCount / 2)

  let marginLeft: number
  if (tileIndex < middleIndex) {
    marginLeft = tileLeft
  } else if (tileIndex === middleIndex) {
    marginLeft = tileLeft + tileWidth / 2 - width / 2
  } else {
    marginLeft = tileLeft + tileWidth - width
  }
  marginLeft = Math.max(0, Math.min(marginLeft, rowWidth - width))

  const tileCenter = tileLeft + tileWidth / 2
  const chevronLeft = Math.max(CHEVRON_EDGE_INSET, Math.min(tileCenter - marginLeft, width - CHEVRON_EDGE_INSET))

  return { width, marginLeft, chevronLeft }
}
