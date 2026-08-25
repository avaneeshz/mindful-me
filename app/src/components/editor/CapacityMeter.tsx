import { SLOT_MINUTES } from '@/domain/slots'
import type { PlacedActivity } from '@/domain/types'
import { cn } from '@/lib/utils'

interface CapacityMeterProps {
  activities: readonly PlacedActivity[]
  /**
   * Minutes of THIS slot already consumed by an earlier anchor's longer
   * activity spilling into it — `domain/slots` `spilloverMinutes(entries,
   * slot)`. 0 for a normal slot, and always 0 for the anchor slot of a
   * spilling activity itself (that activity's OWN overflow is clipped below
   * instead, by the same `SLOT_MINUTES` boundary).
   *
   * Bug fixed here: this meter used to sum `activities` raw, so opening the
   * anchor slot of e.g. a 45-minute activity showed "45/30 min used" — the
   * full activity "attributed" to one 30-minute cell — while the next slot,
   * which actually carries 15 of those minutes, showed "0/30" (empty),
   * because that spillover was never represented in an entry of its own.
   * `spillover` is presentation-only: it mirrors what `remainingMinutesAt` /
   * `isSlotFullAt` already enforce for capacity purposes (Bug C), it does not
   * re-derive or re-enforce it.
   */
  spillover?: number
}

/**
 * "{used}/30 min used" plus a proportional bar.
 *
 * The bar draws ONE fill per activity actually in the slot, each as wide as its
 * own duration — so a single 30-minute entry is one unbroken bar and a 15 + 15
 * pair is two. (It previously drew a fixed pair of segments derived from the
 * per-slot activity CEILING, which read as "2 activities" even when the slot
 * held one.) The fill turns Terracotta only at a genuine 30/30, so the colour
 * carries meaning rather than decoration, and the number is always shown, so
 * capacity is never communicated by colour alone.
 */
export function CapacityMeter({ activities, spillover = 0 }: CapacityMeterProps) {
  const spilloverUsed = Math.min(SLOT_MINUTES, Math.max(0, spillover))

  // Running start offset, beginning after any spillover — and each fill is
  // clipped so it never claims more of THIS 30-minute cell than is actually
  // left in it. Only the anchor slot of an overflowing activity can other-
  // wise overstate itself (a 45-minute activity anchored here would else
  // read as "45/30 min used"); every other slot's own activities already
  // sum to 30 minutes or less by the capacity rule itself.
  let offset = spilloverUsed
  const ownFills = activities.map((activity) => {
    const start = offset
    const duration = Math.max(0, Math.min(activity.duration, SLOT_MINUTES - start))
    offset += duration
    return { start, duration }
  })
  const fills = spilloverUsed > 0 ? [{ start: 0, duration: spilloverUsed }, ...ownFills] : ownFills

  const used = Math.min(
    SLOT_MINUTES,
    spilloverUsed + activities.reduce((sum, activity) => sum + activity.duration, 0),
  )
  const isFull = used >= SLOT_MINUTES

  const countLabel = `${activities.length} ${activities.length === 1 ? 'activity' : 'activities'}`

  return (
    <div className="flex items-center gap-md">
      <span className="whitespace-nowrap text-meta font-semibold text-charcoal">
        {used}/{SLOT_MINUTES} min used
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
        className="relative h-meter w-[96px] overflow-hidden rounded-full bg-bg"
      >
        {fills.map((fill, index) => (
          <span
            key={index}
            className={cn(
              'absolute inset-y-0 rounded-full',
              isFull ? 'bg-terracotta' : 'bg-forest',
            )}
            // The 1px inset on each side leaves a hairline of track showing
            // between adjacent fills, so two entries read as two.
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
