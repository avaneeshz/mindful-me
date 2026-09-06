/**
 * Tile-row auto-fit math (Configuration screen ask #4 — the tile row must
 * always resize to keep every tile in a single fill-width row, generalized
 * from the old fixed-9 assumption to any N, with a sensible responsive wrap
 * at narrow widths instead of squeezing every tile unreadably thin).
 *
 * Pure derivation only — no React, no DOM. The actual layout is enacted by
 * CSS Grid (`TileRow.tsx`'s `.tile-row` uses `grid-template-columns:
 * repeat(auto-fit, minmax(MIN_TILE_WIDTH_PX, 1fr))`, built from the same
 * `MIN_TILE_WIDTH_PX`/`TILE_GAP_PX` constants this module exports), which
 * already implements exactly this "as many equal columns as fit, wrap the
 * rest" algorithm natively and far more robustly than a JS ResizeObserver
 * could (no layout thrash, no measurement lag on rotate/resize). The
 * functions below are the tested, explicit model of that same contract —
 * same reasoning `panelGeometry.ts` documents for its own untestable-in-SSR
 * DOM measurement: the math is pure and tested here, the CSS engine's actual
 * pixel-by-pixel enactment of it is not (and doesn't need to be — it's a
 * one-line browser primitive, not bespoke logic).
 */

/** Below this width a tile's icon + 2-line label stop being comfortably readable. */
export const MIN_TILE_WIDTH_PX = 64

/** Matches `.tile-row`'s `gap-[12px]` in `styles/index.css`. */
export const TILE_GAP_PX = 12

/**
 * How many tiles fit in one row at `containerWidthPx`, given `tileCount`
 * tiles want to share it — the same "largest N such that N tiles at the
 * minimum width plus (N-1) gaps still fit" arithmetic CSS Grid's own
 * `repeat(auto-fit, minmax(...))` performs. Never more than `tileCount`
 * itself (no phantom empty columns stretching real tiles further apart than
 * a full row already would), never fewer than 1 (a single tile always gets
 * a row, however narrow the container).
 */
export function tilesPerRow(containerWidthPx: number, tileCount: number): number {
  if (tileCount <= 0) return 0
  if (containerWidthPx <= 0) return 1
  // n tiles at MIN width + (n-1) gaps must fit: n*MIN + (n-1)*GAP <= width
  // => n <= (width + GAP) / (MIN + GAP)
  const maxFit = Math.floor((containerWidthPx + TILE_GAP_PX) / (MIN_TILE_WIDTH_PX + TILE_GAP_PX))
  return Math.min(tileCount, Math.max(1, maxFit))
}

/** How many rows `tileCount` tiles need at `perRow` tiles per row. */
export function tileRowCount(tileCount: number, perRow: number): number {
  if (tileCount <= 0) return 0
  if (perRow <= 0) return 0
  return Math.ceil(tileCount / perRow)
}

/** The literal `grid-template-columns` value `TileRow.tsx` renders — the single source of truth
 * both the component and this module's own tests build on, so the two can never drift apart. */
export function tileRowGridTemplate(): string {
  return `repeat(auto-fit, minmax(${MIN_TILE_WIDTH_PX}px, 1fr))`
}
