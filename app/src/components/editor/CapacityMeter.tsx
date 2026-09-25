import { SLOT_MINUTES } from '@/domain/slots'
import { cn } from '@/lib/utils'

export interface CapacityMeterSegment {
  id: string
  minutes: number
}

interface CapacityMeterProps {
  /**
   * Already-clipped, non-overlapping minute shares for this grid cell, in
   * chronological order — see `minutesInSlot`. Because activities may never
   * overlap (rule 1), these always sum to at most `SLOT_MINUTES` by
   * construction; this component draws them, it does not enforce that.
   */
  segments: CapacityMeterSegment[]
}

/**
 * "{used}/30 min used" plus a proportional bar — one fill per activity
 * actually touching this 30-minute grid cell, each sized by its own real
 * share of it (a 45-minute activity anchored one cell earlier shows only the
 * 15 minutes of THIS cell it actually reaches, never its full duration). No
 * colour any more (Section A) — the fill goes from `ink-dim` to solid `ink`
 * only at a genuine 30/30, an intensity step within the same neutral, not a
 * hue change, and the number is always shown too, so capacity is never
 * communicated by shade alone either.
 */
export function CapacityMeter({ segments }: CapacityMeterProps) {
  let offset = 0
  const fills = segments.map((segment) => {
    const start = offset
    offset += segment.minutes
    return { id: segment.id, start, duration: segment.minutes }
  })

  const used = Math.min(SLOT_MINUTES, offset)
  const isFull = used >= SLOT_MINUTES
  const countLabel = `${segments.length} ${segments.length === 1 ? 'activity' : 'activities'}`

  return (
    <div className="flex items-center gap-md">
      <span className={cn('whitespace-nowrap text-meta font-semibold', isFull ? 'text-ink' : 'text-ink-dim')}>
        {used}/{SLOT_MINUTES} min
      </span>
      <div
        role="progressbar"
        aria-label="Slot capacity"
        aria-valuemin={0}
        aria-valuemax={SLOT_MINUTES}
        aria-valuenow={used}
        aria-valuetext={`${used} of ${SLOT_MINUTES} minutes used across ${countLabel}${
          isFull ? ', slot full' : ''
        }`}
        className="relative h-2 w-full max-w-[120px] overflow-hidden rounded-full bg-line-soft border border-line-softer transition-all duration-200"
      >
        {fills.map((fill) => (
          <span
            key={fill.id}
            className={cn(
              'absolute inset-y-0 rounded-full transition-all duration-300',
              isFull ? 'bg-accent-success shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]' : 'bg-ink-dim',
            )}
            style={{
              left: `calc(${(fill.start / SLOT_MINUTES) * 100}% + 1px)`,
              width: `calc(${(fill.duration / SLOT_MINUTES) * 100}% - 2px)`,
            }}
          />
        ))}
      </div>
    </div>
  )
}
