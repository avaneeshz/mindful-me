import type { LucideIcon } from 'lucide-react'
import { Activity, HeartPulse, Pencil, Shield, X } from 'lucide-react'
import { categoryOf, findCard } from '@/data/activities'
import { REFLECTION_CARDS } from '@/data/reflectionCards'
import { formatActivityRange } from '@/domain/slots'
import type { ScheduledActivity } from '@/domain/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CategoryIconChip } from './CategoryIconChip'

/**
 * The read-only detail view for an activity selected on the timeline — the
 * "activity mode" body of `SlotEditor` (Frame 1). It REPLACES the slot
 * heading / capacity meter / "In this slot" list / tile row while an
 * activity is selected; the reflection grid (Frame 2) never shows any of
 * this.
 *
 * Layout: an identity header (icon + name + time, with Edit / Remove / Close
 * inline), then a two-column body — the activity's own signals (quality,
 * chronic symptoms, protective response, notes) on the left, the reflection
 * cards already mapped to it on the right. The header keeps space on the
 * right (large screens only) for a day/night illustration planned for a
 * later iteration.
 */
export function ActivitySummary({
  activity,
  onEdit,
  onRemove,
  onClose,
  onOpenNote,
}: {
  activity: ScheduledActivity
  onEdit: () => void
  onRemove: () => void
  onClose: () => void
  /** Tap a mapped reflection thumbnail — opens its note-entry popup (edit/remove that pairing). */
  onOpenNote: (card: number) => void
}) {
  const name = activity.name ?? 'Activity'
  const card = activity.name ? findCard(activity.name) : undefined
  const category = activity.name ? categoryOf(activity.name) : undefined
  const isCompleted = activity.status === 'completed'

  return (
    <div>
      <header className="flex items-start justify-between gap-lg border-b border-line pb-lg">
        <div className="flex min-w-0 flex-1 flex-col gap-sm">
          <div className="flex flex-wrap items-center gap-md">
            {category && <CategoryIconChip category={category} icon={card?.icon} />}
            <h2 className="font-display text-slot-time font-semibold text-ink">{name}</h2>
            {isCompleted && (
              <span className="rounded-full bg-ink/10 px-sm py-xs text-micro font-bold uppercase tracking-tag text-ink">
                Completed
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-lg">
            <p className="text-caption text-ink-dim">
              {formatActivityRange(activity.startMinutes, activity.durationMinutes)}
              {activity.path.length > 0 && ` · ${activity.path.join(' · ')}`}
            </p>

            <div className="flex items-center gap-lg">
              <Button variant="accent" size="inline" onClick={onEdit} aria-label={`Edit ${name}`}>
                <Pencil aria-hidden="true" className="size-[13px]" />
                Edit
              </Button>
              <Button variant="destructive" size="inline" onClick={onRemove} aria-label={`Remove ${name}`}>
                <X aria-hidden="true" className="size-[13px]" />
                Remove
              </Button>
              <button
                type="button"
                aria-label="Close activity summary"
                onClick={onClose}
                className="flex size-stepper shrink-0 items-center justify-center rounded-full text-ink-dim transition-colors hover:bg-bg hover:text-ink"
              >
                <X aria-hidden="true" className="size-[16px]" />
              </button>
            </div>
          </div>
        </div>

        {/* Reserved for a day/night illustration in a later iteration —
            large screens only, so it never squeezes the mobile header. */}
        <div aria-hidden="true" className="hidden shrink-0 lg:block lg:w-[200px]" />
      </header>

      {/* Body splits 50/50: signals on the left, reflection on the right.
          The left half is itself split three ways for the signal groups.
          Both halves stack on a narrow viewport. */}
      <div className="mt-xl grid gap-2xl md:grid-cols-2 ipad-land:mt-lg ipad-land:gap-xl">
        <div className="flex flex-col gap-xl">
          <div className="grid grid-cols-1 gap-lg sm:grid-cols-3">
            <SignalGroup icon={Activity} label="Activity Quality" values={activity.quality} />
            <SignalGroup icon={HeartPulse} label="Chronic Symptoms" values={activity.symptoms} />
            <SignalGroup icon={Shield} label="Protective Response" values={activity.flags} />
          </div>

          {activity.notes && (
            <div>
              <p className="text-nano font-semibold uppercase tracking-tag text-ink-dim">Notes</p>
              <p className="mt-xs whitespace-pre-wrap text-note text-ink">{activity.notes}</p>
            </div>
          )}
        </div>

        <div className="md:border-l md:border-line md:pl-2xl">
          <p className="text-nano font-semibold uppercase tracking-tag text-ink-dim">Reflection</p>
          {activity.reflections.length > 0 ? (
            <ul className="mt-sm flex flex-wrap gap-md">
              {activity.reflections.map((r) => {
                const rc = REFLECTION_CARDS.find((c) => c.number === r.card)
                const title = rc?.title ?? `Card ${r.card}`
                return (
                  <li key={r.card}>
                    <button
                      type="button"
                      onClick={() => onOpenNote(r.card)}
                      aria-label={`${title} — edit reflection note`}
                      className="block w-[72px] overflow-hidden rounded-sm border border-line bg-surface-2 transition-colors hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                    >
                      <span className="block aspect-[4/3] w-full">
                        {rc && <img src={rc.image} alt="" className="size-full object-cover" />}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="mt-sm text-note text-ink-dim">None yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}

/** One signal group — icon + label on one line, the recorded values as plain text below (or a dim dash when none). */
function SignalGroup({
  icon: Icon,
  label,
  values,
}: {
  icon: LucideIcon
  label: string
  values: readonly string[]
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-sm">
        <Icon aria-hidden="true" className="size-[15px] shrink-0 text-ink-dim" />
        <p className="text-nano font-semibold uppercase tracking-tag text-ink-dim">{label}</p>
      </div>
      <p className={cn('mt-xs text-note', values.length > 0 ? 'text-ink' : 'text-ink-dim')}>
        {values.length > 0 ? values.join(', ') : '—'}
      </p>
    </div>
  )
}
