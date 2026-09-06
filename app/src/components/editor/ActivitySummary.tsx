import { categoryOf, findCard } from '@/data/activities'
import { formatActivityRange, formatDurationLabel } from '@/domain/slots'
import type { ScheduledActivity } from '@/domain/types'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { cn } from '@/lib/utils'
import { CategoryIconChip } from './CategoryIconChip'

interface ActivitySummaryProps {
  /** The activity currently being viewed, or undefined when it no longer resolves. */
  activity: ScheduledActivity | undefined
  onEdit: (id: string) => void
}

/**
 * The read-only "Activity" side of `SlotEditor`'s Activity | Slot toggle.
 * Clicking a scheduled activity's own rendered segment on the timeline no
 * longer jumps straight into `LogActivityModal` — it lands here first, and
 * this view's own Edit button is the only thing that opens that modal
 * (dispatching the unchanged `editActivity` action). Every field below is
 * display-only.
 */
export function ActivitySummary({ activity, onEdit }: ActivitySummaryProps) {
  if (!activity || activity.name === null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-sm py-2xl text-center">
        <p className="max-w-[34ch] text-body font-medium text-ink-dim">
          Tap a scheduled activity on the timeline to see its details here.
        </p>
      </div>
    )
  }

  const card = findCard(activity.name)
  const category = categoryOf(activity.name)
  const pathLabel = activity.path.length > 0 ? activity.path.join(' · ') : null

  // Up to three tag categories, laid out side by side instead of stacked
  // (Panel Redesign §4) — only the ones actually present get a column, so a
  // one- or two-tag entry never leaves a dead empty column behind.
  const tagSections: { label: string; values: readonly string[] }[] = []
  if (activity.quality.length > 0) tagSections.push({ label: 'Activity quality', values: activity.quality })
  if (activity.flags.length > 0) tagSections.push({ label: 'Protective response', values: activity.flags })
  if (activity.symptoms.length > 0) tagSections.push({ label: 'Chronic Symptoms', values: activity.symptoms })

  // Tailwind can't compose a class name from a runtime count, so the three
  // reachable column counts (1/2/3 present) are spelled out — full count on
  // desktop and ipad-land (same "structure never changes above mobile"
  // convention as the rest of this design system), one stacked column on
  // mobile since tag labels ("Trauma Activation", "Over Accommodating", …)
  // run long enough that a squeezed 2-3 column phone layout stops reading.
  const tagGridColsClass =
    tagSections.length === 3 ? 'grid-cols-3' : tagSections.length === 2 ? 'grid-cols-2' : 'grid-cols-1'

  return (
    // `justify-center` — not `mt-auto` on the Edit button alone — so a short
    // entry (no quality/symptoms/flags/notes yet) centers as one balanced
    // block within the shared min-height instead of stranding Edit at the
    // very bottom with a dead gap above it.
    <div className="flex flex-1 flex-col justify-center gap-lg">
      {/* Icon+name+path and the time range/duration share one row instead of
          two full-width ones — the header no longer needs its own line. */}
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div className="flex min-w-0 items-start gap-md">
          <CategoryIconChip category={category} icon={card?.icon} />
          <div className="min-w-0">
            <h3 className="text-h1-sm font-semibold text-ink">{activity.name}</h3>
            {pathLabel && <p className="text-caption font-medium text-ink-dim">{pathLabel}</p>}
          </div>
        </div>
        <p className="shrink-0 text-body font-semibold text-ink">
          {formatActivityRange(activity.startMinutes, activity.durationMinutes)}{' '}
          <span className="text-caption font-medium text-ink-dim">
            ({formatDurationLabel(activity.durationMinutes)})
          </span>
        </p>
      </div>

      {tagSections.length > 0 && (
        <div className={cn('grid gap-lg mobile:grid-cols-1', tagGridColsClass)}>
          {tagSections.map((section) => (
            <SummaryTagSection key={section.label} label={section.label} values={section.values} />
          ))}
        </div>
      )}

      {activity.notes && (
        <div className="flex flex-col gap-xs">
          <h4 className="text-nano font-bold uppercase tracking-tag text-ink-dim">Notes</h4>
          <p className="whitespace-pre-wrap text-body text-ink">{activity.notes}</p>
        </div>
      )}

      <div className="flex justify-center">
        <Button onClick={() => onEdit(activity.id)} className="rounded-full px-2xl">
          Edit
        </Button>
      </div>
    </div>
  )
}

function SummaryTagSection({ label, values }: { label: string; values: readonly string[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-sm">
      <h4 className="text-nano font-bold uppercase tracking-tag text-ink-dim">{label}</h4>
      <div className="flex flex-wrap gap-sm">
        {values.map((value) => (
          <Chip key={value} size="xs">
            {value}
          </Chip>
        ))}
      </div>
    </div>
  )
}
