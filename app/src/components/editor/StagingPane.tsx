import { Minus, Plus } from 'lucide-react'
import { categoryOf, findCard } from '@/data/activities'
import { DURATION_STEP_MINUTES, MIN_DURATION_MINUTES } from '@/domain/scheduling'
import { type StagingState } from '@/state/boardReducer'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CategoryIconChip } from './CategoryIconChip'

interface StagingPaneProps {
  staging: StagingState
  /** Largest committable duration right now, after the capacity rules. */
  maxDuration: number
  /**
   * Whether `commit` would actually place something. Computed ONCE by SlotEditor
   * and passed to both this button and the mobile sticky bar — the two used to
   * derive it separately with different rules, so the desktop button could be
   * enabled while commit silently no-oped.
   */
  canCommit: boolean
  onStep: (delta: number) => void
  onCommit: () => void
  onCancel: () => void
}

export const CAPACITY_MESSAGE_ID = 'staging-capacity-message'

export function primaryActionLabel(staging: StagingState): string {
  return staging.editingId !== null ? 'Save changes' : 'Add to slot'
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`
}

/**
 * A flat panel on the page background, separated by a single hairline — NOT a
 * white card. The editor is already an elevation-1 surface, and nesting a card
 * inside a card is the "excessive rounded containers" anti-pattern.
 */
export function StagingPane({
  staging,
  maxDuration,
  canCommit,
  onStep,
  onCommit,
  onCancel,
}: StagingPaneProps) {
  // No staged pick, no pane. The "Choose an activity" placeholder that used to
  // stand here restated what the tile grid beside it already makes obvious, and
  // reserved a column of empty space to say it. The pane now appears only once
  // there is something to configure, and the picker reflows into the space.
  if (!staging.cardName) return null

  const card = findCard(staging.cardName)
  const category = categoryOf(staging.cardName)
  const atCeiling = staging.durationMinutes >= maxDuration

  return (
    // `ipad-land:gap-md` is the same short-landscape density adaptation used
    // throughout this screen, not a structural change — see Acceptance
    // Criterion 13. It applies where vertical room is scarcest.
    <div className="staging-pane flex flex-col gap-lg ipad-land:gap-md">
      <div className="flex items-start gap-md">
        <CategoryIconChip category={category} icon={card?.icon} />
        <div className="min-w-0">
          <p className="text-entry-name font-semibold text-charcoal">{staging.cardName}</p>
          {staging.path.length > 0 && (
            <p className="mt-xs text-caption font-medium text-muted">
              {staging.path.join(' · ')}
            </p>
          )}
        </div>
      </div>

      {/*
        The stepper and its ceiling message are ONE group, not two peers a full
        gap apart: the message explains the stepper's limit, so binding it tight
        underneath is both the correct reading order and the exact state where
        vertical space is tightest (Acceptance Criterion 13 — a second activity
        in a partially-filled slot is what pushes the primary action toward the
        fold on iPad landscape).
      */}
      <div className="flex flex-col gap-sm">
        <DurationStepper
          duration={staging.durationMinutes}
          maxDuration={maxDuration}
          atCeiling={atCeiling}
          onStep={onStep}
        />

        {/*
          Acceptance Criterion 9: the ceiling is stated, not silently applied.
          Gold is the informational/limiting tone; Terracotta stays reserved for
          destructive actions.
        */}
        {atCeiling && (
          <p id={CAPACITY_MESSAGE_ID} role="status" className="text-note font-medium text-gold">
            Capped at {formatDuration(maxDuration)} — the next activity begins there.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-sm">
        {/* On mobile the primary action lives in the sticky bottom bar instead. */}
        <Button block disabled={!canCommit} onClick={onCommit} className="mobile:hidden">
          {primaryActionLabel(staging)}
        </Button>
        <Button variant="ghost" size="control" block onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function DurationStepper({
  duration,
  maxDuration,
  atCeiling,
  onStep,
}: {
  duration: number
  maxDuration: number
  atCeiling: boolean
  onStep: (delta: number) => void
}) {
  const canDecrease = duration > MIN_DURATION_MINUTES
  const canIncrease = duration < maxDuration

  const stepButton =
    'flex size-stepper items-center justify-center rounded-full border border-line bg-white text-forest transition-colors hover:border-forest-light disabled:opacity-40 disabled:hover:border-line'

  return (
    <div>
      <p id="duration-label" className="mb-sm text-caption font-semibold text-muted">
        Duration
      </p>
      <div className="flex items-center gap-lg">
        <button
          type="button"
          onClick={() => onStep(-DURATION_STEP_MINUTES)}
          disabled={!canDecrease}
          aria-label={`Decrease duration by ${DURATION_STEP_MINUTES} minutes`}
          className={stepButton}
        >
          <Minus aria-hidden="true" className="size-[18px]" />
        </button>

        <output
          aria-labelledby="duration-label"
          className="min-w-[64px] text-center font-display text-stepper font-semibold text-charcoal"
        >
          {formatDuration(duration)}
        </output>

        {/*
          At the ceiling the + button stays visibly present rather than
          disappearing or dimming into a dead control — it is explained by the
          capacity message it points at.
        */}
        <button
          type="button"
          onClick={() => canIncrease && onStep(DURATION_STEP_MINUTES)}
          disabled={!canIncrease}
          aria-describedby={atCeiling ? CAPACITY_MESSAGE_ID : undefined}
          aria-label={`Increase duration by ${DURATION_STEP_MINUTES} minutes`}
          className={cn(stepButton, !canIncrease && 'cursor-not-allowed')}
        >
          <Plus aria-hidden="true" className="size-[18px]" />
        </button>
      </div>
    </div>
  )
}
