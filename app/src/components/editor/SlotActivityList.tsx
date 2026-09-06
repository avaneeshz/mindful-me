import { CheckCircle2, Circle, Pencil, X } from 'lucide-react'
import { findCardIn } from '@/domain/catalog'
import { formatMinutes, minutesInSlot, startsInSlot } from '@/domain/slots'
import type { ScheduledActivity } from '@/domain/types'
import type { RemovalRecord } from '@/state/boardReducer'
import { useCatalog } from '@/state/CatalogContext'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CategoryIconChip } from './CategoryIconChip'

interface SlotActivityListProps {
  /** Real activities overlapping the selected slot, in start-time order. */
  touching: ScheduledActivity[]
  selectedSlot: number
  /** Shown inline only while it overlaps the selected slot's window. */
  removal: RemovalRecord | null
  /** Id of the activity currently loaded into the stepper below, if any. */
  editingId: string | null
  onEdit: (id: string) => void
  onRemove: (id: string) => void
  onToggleComplete: (id: string) => void
  onUndo: () => void
}

export function SlotActivityList({
  touching,
  selectedSlot,
  removal,
  editingId,
  onEdit,
  onRemove,
  onToggleComplete,
  onUndo,
}: SlotActivityListProps) {
  const removalHere = removal && minutesInSlot(removal.activity, selectedSlot) > 0 ? removal : null

  // Empty slot: the list is omitted entirely. The exception is an in-flight
  // undo for an activity that used to overlap this exact slot.
  if (touching.length === 0 && !removalHere) return null

  return (
    <div className="mt-2xl ipad-land:mt-md">
      <h3 className="mb-sm text-nano font-bold uppercase tracking-tag text-ink-dim">In this slot</h3>
      <ul className="flex flex-col gap-sm">
        {touching.map((activity) => (
          <ActivityRow
            key={activity.id}
            activity={activity}
            displayDuration={minutesInSlot(activity, selectedSlot)}
            isEditing={activity.id === editingId}
            continuedFrom={startsInSlot(activity, selectedSlot) ? null : activity.startMinutes}
            onEdit={() => onEdit(activity.id)}
            onRemove={() => onRemove(activity.id)}
            onToggleComplete={() => onToggleComplete(activity.id)}
          />
        ))}
        {removalHere && (
          <UndoRow key={`undo-${removalHere.activity.id}`} name={removalHere.activity.name ?? 'Activity'} onUndo={onUndo} />
        )}
      </ul>
    </div>
  )
}

function ActivityRow({
  activity,
  displayDuration,
  isEditing,
  continuedFrom,
  onEdit,
  onRemove,
  onToggleComplete,
}: {
  activity: ScheduledActivity
  /** This row's real share of the SELECTED slot — may differ from the activity's full duration. */
  displayDuration: number
  isEditing: boolean
  /** Set only when the activity started before this slot and merely continues through it. */
  continuedFrom: number | null
  onEdit: () => void
  onRemove: () => void
  onToggleComplete: () => void
}) {
  const { snapshot } = useCatalog()
  const name = activity.name ?? 'Activity'
  const card = findCardIn(snapshot, name)
  const category = card ? snapshot.categories[card.categoryId] : undefined
  const pathLabel = activity.path.length > 0 ? activity.path.join(' · ') : null
  const continuedFromLabel = continuedFrom !== null ? formatMinutes(continuedFrom) : null
  const isCompleted = activity.status === 'completed'

  return (
    <li
      aria-current={isEditing ? 'true' : undefined}
      className={cn(
        'group flex min-h-row flex-wrap items-center gap-md rounded-md bg-bg px-md py-sm',
        'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink',
        // Same ink outline the timeline uses for its selected slot, so
        // "this is the one you are working on" reads identically in both places.
        isEditing && 'outline outline-1.5 -outline-offset-1.5 outline-ink',
      )}
    >
      {/*
        Planned vs. actual (Phase 3). A real checkbox semantic, not a bare
        icon button — assistive tech announces "checked"/"not checked", never
        colour alone. Placed first: this is the one control that changes the
        row's own identity (completed or not), ahead of the actions that act
        ON the row.
      */}
      <button
        type="button"
        role="checkbox"
        aria-checked={isCompleted}
        aria-label={isCompleted ? `Mark ${name} not completed` : `Mark ${name} completed`}
        onClick={onToggleComplete}
        className={cn(
          'flex size-[22px] shrink-0 items-center justify-center rounded-full transition-colors',
          isCompleted ? 'text-ink' : 'text-line hover:text-ink-dim',
        )}
      >
        {isCompleted ? (
          <CheckCircle2 aria-hidden="true" className="size-[20px]" fill="currentColor" stroke="var(--bg)" />
        ) : (
          <Circle aria-hidden="true" className="size-[20px]" strokeWidth={1.75} />
        )}
      </button>

      <CategoryIconChip category={category} icon={card?.icon} />

      <span className="min-w-0 flex-1">
        {/* Row hover changes the underline only — no background shift. */}
        <span
          className={cn(
            'text-body font-semibold text-ink group-hover:underline group-hover:underline-offset-2',
            isCompleted && 'text-ink-dim line-through decoration-1',
          )}
        >
          {name}
        </span>
        {pathLabel && (
          <span className="text-caption font-medium text-ink-dim"> · {pathLabel}</span>
        )}
        {continuedFromLabel && (
          <span className="text-caption font-medium text-ink-dim">
            {' '}
            · continues from {continuedFromLabel}
          </span>
        )}
      </span>

      {/*
        The outline/strikethrough alone would carry state by appearance only.
        Both tags state it in words too — same pill treatment as the editor's
        NOW badge, and they can legitimately coexist (editing a completed
        activity, e.g. to fix its time after the fact — rule 4).
      */}
      {isCompleted && (
        <span className="rounded-full bg-ink/10 px-sm py-xs text-micro font-bold uppercase tracking-tag text-ink">
          Completed
        </span>
      )}
      {isEditing && (
        <span className="rounded-full bg-ink/10 px-sm py-xs text-micro font-bold uppercase tracking-tag text-ink">
          Editing
        </span>
      )}

      <span className="text-meta font-semibold text-ink-dim">{displayDuration} min</span>

      {/* Both actions are always icon + text, never icon-only. Editing/removing
          always acts on the one real activity directly, wherever it starts —
          there is no more "jump to the anchor first" step, since ids replace
          the old slot-anchored index entirely. */}
      <Button
        variant="accent"
        size="inline"
        onClick={onEdit}
        aria-label={
          continuedFromLabel ? `Edit ${name}, continuing from its ${continuedFromLabel} slot` : `Edit ${name}`
        }
      >
        <Pencil aria-hidden="true" className="size-[13px]" />
        Edit
      </Button>
      <Button
        variant="destructive"
        size="inline"
        onClick={onRemove}
        aria-label={
          continuedFromLabel
            ? `Remove ${name}, anchored in its ${continuedFromLabel} slot`
            : `Remove ${name}`
        }
      >
        <X aria-hidden="true" className="size-[13px]" />
        Remove
      </Button>
    </li>
  )
}

/**
 * Sits in the removed row's position for ~4 seconds and fades out over the
 * final ~300ms (plain CSS keyframe — see tailwind.config.js `undo-fade`).
 */
function UndoRow({ name, onUndo }: { name: string; onUndo: () => void }) {
  return (
    <li
      role="status"
      aria-live="polite"
      className="flex min-h-row animate-undo-fade items-center gap-sm rounded-md px-md text-meta font-medium text-ink-dim"
    >
      <span>Removed {name} ·</span>
      <button type="button" onClick={onUndo} className="font-semibold text-ink hover:underline">
        Undo
      </button>
    </li>
  )
}
