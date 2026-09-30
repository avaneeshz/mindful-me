/**
 * Colours and wrapper classes the Health Sync charts draw with. Each interface
 * passes its own, so Classic and Lumen share one chart implementation instead
 * of two copies. Class strings must be defined in the interface's own source
 * tree (Lumen compiles Tailwind separately, scanning only `app/src/lumen`).
 */
export interface HealthChartPalette {
  /** The data mark: bars, lines, the area outline. */
  mark: string
  /** Axis tick labels. */
  tick: string
  axis: string
  grid: string
  /** Hover cursor fill/stroke. */
  cursor: string
  tooltipClass: string
  tooltipValueClass: string
  tooltipLabelClass: string
  emptyClass: string
}

export const CLASSIC_CHART_PALETTE: HealthChartPalette = {
  mark: 'var(--ink)',
  tick: 'var(--ink-dim)',
  axis: 'var(--line)',
  grid: 'var(--line-soft)',
  cursor: 'var(--line-soft)',
  tooltipClass: 'rounded-md border border-line bg-surface px-md py-sm text-caption shadow-elevation-1',
  tooltipValueClass: 'font-semibold text-ink',
  tooltipLabelClass: 'text-ink-dim',
  emptyClass:
    'flex items-center justify-center rounded-md border border-dashed border-line px-lg text-center text-caption text-ink-dim',
}
