import { Pencil, X } from 'lucide-react'
import { categoryOf, findCard } from '@/data/activities'
import { formatSlotStart, SLOT_MINUTES } from '@/domain/slots'
import type { PlacedActivity } from '@/domain/types'
import type { RemovalRecord } from '@/state/boardReducer'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CategoryIconChip } from './CategoryIconChip'

/**
 * A slot's read-only share of an activity that is really anchored earlier —
 * the exact shape `domain/slots`' `spilloverActivity` returns, so callers can
 * pass it straight through.
 */
export interface SpilloverRow {
  activity: PlacedActivity
  /** Minutes of THIS slot the activity occupies — never the raw total. */
  minutesHere: number
  /** Where the real record lives; Edit/Remove here act on it there. */
  anchorSlot: number
  index: number
}

interface SlotActivityListProps {
  activities: readonly PlacedActivity[]
  /**
   * The portion (if any) of an earlier anchor's longer activity spilling
   * into this slot. Rendered first — chronologically it started before
   * anything native to this slot. There is only ever one copy of the real
   * activity: Edit loads it into the SAME stepper below IN PLACE (this row's
   * slot stays selected); Remove is more disruptive and still jumps to the
   * anchor, where the Undo affordance for it lives.
   */
  spillover: SpilloverRow | null
  /** True while the stepper below is showing the SPILLOVER row's activity. */
  spilloverIsEditing: boolean
  /** Non-null only while an undo affordance is live for THIS slot. */
  removal: RemovalRecord | null
  /**
   * Index of the row currently loaded into the editor, or null when adding a
   * new activity, OR when the row being edited is the spillover one (see
   * `spilloverIsEditing`) — with two activities in a slot, nothing else on
   * screen says WHICH one the staging pane is showing.
   */
  editingIndex: number | null
  onEdit: (index: number) => void
  onRemove: (index: number) => void
  onEditSpillover: () => void
  onRemoveSpillover: () => void
  onUndo: () => void
}

export function SlotActivityList({
  activities,
  spillover,
  spilloverIsEditing,
  removal,
  editingIndex,
  onEdit,
  onRemove,
  onEditSpillover,
  onRemoveSpillover,
  onUndo,
}: SlotActivityListProps) {
  // Empty slot: the list is omitted entirely (existing behaviour). The
  // exceptions are an in-flight undo, and a slot that is nothing BUT
  // someone else's spillover — both must still be reachable/visible.
  if (activities.length === 0 && !removal && !spillover) return null

  const undoPosition = removal ? Math.min(removal.index, activities.length) : -1

  const rows = activities.map((activity, index) => (
    <ActivityRow
      key={`${activity.name}-${index}`}
      activity={activity}
      // A slot's own activities never show more than their share of THIS
      // 30-minute cell — the one case that otherwise wouldn't hold is the
      // sole activity anchored here whose real duration runs past 30 minutes
      // into later slots (see `spilloverActivity` for the mirror case).
      displayDuration={Math.min(activity.duration, SLOT_MINUTES)}
      isEditing={index === editingIndex}
      onEdit={() => onEdit(index)}
      onRemove={() => onRemove(index)}
    />
  ))

  if (spillover) {
    rows.unshift(
      <ActivityRow
        key={`spillover-${spillover.anchorSlot}-${spillover.index}`}
        activity={spillover.activity}
        displayDuration={spillover.minutesHere}
        isEditing={spilloverIsEditing}
        continuedFrom={spillover.anchorSlot}
        editIsInPlace
        onEdit={onEditSpillover}
        onRemove={onRemoveSpillover}
      />,
    )
  }

  if (removal) {
    rows.splice(
      spillover ? undoPosition + 1 : undoPosition,
      0,
      <UndoRow key={`undo-${removal.id}`} name={removal.activity.name} onUndo={onUndo} />,
    )
  }

  return (
    <div className="mt-2xl ipad-land:mt-md">
      <h3 className="mb-sm text-nano font-bold uppercase tracking-tag text-muted">In this slot</h3>
      <ul className="flex flex-col gap-sm">{rows}</ul>
    </div>
  )
}

function ActivityRow({
  activity,
  displayDuration,
  isEditing,
  continuedFrom,
  editIsInPlace,
  onEdit,
  onRemove,
}: {
  activity: PlacedActivity
  /** What to show as this row's duration — may differ from `activity.duration`. */
  displayDuration: number
  isEditing: boolean
  /**
   * Set only for a spillover row: the slot this activity is really anchored
   * at. Both actions act on the real record there, but only Remove actually
   * navigates there (see `editIsInPlace`) — the label wording differs to
   * match what each button is actually about to do.
   */
  continuedFrom?: number
  /**
   * True for a spillover row's Edit: it loads the real activity into the
   * stepper right here, without navigating away — so its label states where
   * the activity CONTINUES from rather than where Edit is "in" (it isn't).
   */
  editIsInPlace?: boolean
  onEdit: () => void
  onRemove: () => void
}) {
  const card = findCard(activity.name)
  const category = categoryOf(activity.name)
  const pathLabel = activity.path.length > 0 ? activity.path.join(' · ') : null
  const continuedFromLabel = continuedFrom !== undefined ? formatSlotStart(continuedFrom) : null

  return (
    <li
      aria-current={isEditing ? 'true' : undefined}
      className={cn(
        'group flex min-h-row flex-wrap items-center gap-md rounded-md bg-bg px-md py-sm',
        'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-forest',
        // Same Deep Forest outline the timeline uses for its selected slot, so
        // "this is the one you are working on" reads identically in both places.
        isEditing && 'outline outline-1.5 -outline-offset-1.5 outline-forest',
      )}
    >
      <CategoryIconChip category={category} icon={card?.icon} />

      <span className="min-w-0 flex-1">
        {/* Row hover changes the underline only — no background shift. */}
        <span className="text-body font-semibold text-charcoal group-hover:underline group-hover:underline-offset-2">
          {activity.name}
        </span>
        {pathLabel && (
          <span className="text-caption font-medium text-muted"> · {pathLabel}</span>
        )}
        {continuedFromLabel && (
          <span className="text-caption font-medium text-muted">
            {' '}
            · continues from {continuedFromLabel}
          </span>
        )}
      </span>

      {/*
        The outline alone would carry this state by colour only. The tag states
        it in words as well — same pill treatment as the editor's NOW badge.
      */}
      {isEditing && (
        <span className="rounded-full bg-forest/10 px-sm py-xs text-micro font-bold uppercase tracking-tag text-forest">
          Editing
        </span>
      )}

      <span className="text-meta font-semibold text-muted">{displayDuration} min</span>

      {/* Both actions are always icon + text, never icon-only. */}
      <Button
        variant="accent"
        size="inline"
        onClick={onEdit}
        aria-label={
          continuedFromLabel
            ? editIsInPlace
              ? `Edit ${activity.name}, continuing from its ${continuedFromLabel} slot`
              : `Edit ${activity.name}, in its ${continuedFromLabel} slot`
            : `Edit ${activity.name}`
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
            ? `Remove ${activity.name}, anchored in its ${continuedFromLabel} slot`
            : `Remove ${activity.name}`
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
      className="flex min-h-row animate-undo-fade items-center gap-sm rounded-md px-md text-meta font-medium text-muted"
    >
      <span>Removed {name} ·</span>
      <button type="button" onClick={onUndo} className="font-semibold text-gold hover:underline">
        Undo
      </button>
    </li>
  )
}
