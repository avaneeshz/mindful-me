import { cn } from '@/lib/utils'

export interface MeterProps {
  /** Names what the meter measures — doubles as its accessible label. */
  label: string
  value: number
  max: number
  /** e.g. "9h 30m occupied of 24h" or "6 of 9 completed" — the number is always shown (never colour alone). */
  valueLabel: string
  className?: string
}

/**
 * A single ratio against a limit — same visual grammar as the editor's
 * `CapacityMeter` (track + fill, Deep Forest, rounded-full), generalized to
 * one arbitrary value/max pair instead of a 30-minute slot's activity
 * segments. Used for both free-vs-occupied time and completion rate — a
 * "single ratio against a limit" is a meter, not a 2-slice pie (see the
 * `dataviz` skill's own form guidance).
 */
export function Meter({ label, value, max, valueLabel, className }: MeterProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0

  return (
    <div className={cn('flex flex-col gap-sm', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-sm">
        <span className="text-note font-semibold text-charcoal">{label}</span>
        <span className="text-caption font-medium text-muted">{valueLabel}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueLabel}
        className="h-meter w-full overflow-hidden rounded-full bg-bg"
      >
        <span className="block h-full rounded-full bg-forest transition-[width] duration-300 ease-out-soft" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
