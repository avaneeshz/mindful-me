import type { HealthChartPalette } from '@/components/healthsync/chartPalette'

/**
 * Lumen's colours for the shared Health Sync charts. Lives under `lumen/` so
 * Lumen's own Tailwind build sees these class names.
 */
export const LUMEN_CHART_PALETTE: HealthChartPalette = {
  mark: 'rgb(var(--lm-accent-ink))',
  tick: 'rgb(var(--lm-ink-faint))',
  axis: 'rgb(var(--lm-line) / 0.16)',
  grid: 'rgb(var(--lm-line) / 0.07)',
  cursor: 'rgb(var(--lm-line) / 0.08)',
  tooltipClass: 'rounded-control border border-line/[0.09] bg-surface-2 px-3 py-2 text-xs shadow-raised',
  tooltipValueClass: 'font-medium text-ink',
  tooltipLabelClass: 'text-ink-muted',
  emptyClass: 'flex items-center justify-center rounded-tile border border-dashed border-line/[0.12] px-4 text-center text-sm text-ink-faint',
}
