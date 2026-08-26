import { useEffect, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { Minus, Plus } from 'lucide-react'
import { categoryOf, findCard } from '@/data/activities'
import { DURATION_STEP_MINUTES } from '@/domain/scheduling'
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
  /**
   * Set an exact duration — from the manual entry field or a quick-add
   * button. Goes through the same reducer clamp (overlap + continuous-block
   * ceiling) as `onStep`, just without snapping to the 5-minute grid.
   */
  onSetDuration: (minutes: number) => void
  onCommit: () => void
  onCancel: () => void
}

export const CAPACITY_MESSAGE_ID = 'staging-capacity-message'

/** The stepper's own floor — see `clampStepDuration` in domain/scheduling.ts. */
const STEPPER_MIN_DURATION_MINUTES = DURATION_STEP_MINUTES

const QUICK_ADD_OPTIONS: Array<{ label: string; minutes: number; description: string }> = [
  { label: '30min', minutes: 30, description: 'Add 30 minutes to duration' },
  { label: '1hr', minutes: 60, description: 'Add 1 hour to duration' },
  { label: '2hr', minutes: 120, description: 'Add 2 hours to duration' },
]

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
  onSetDuration,
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
        The stepper, quick-add and the ceiling message are ONE group, not
        peers a full gap apart: the message explains both controls' shared
        limit, so binding it tight underneath is both the correct reading
        order and the exact state where vertical space is tightest
        (Acceptance Criterion 13 — a second activity in a partially-filled
        slot is what pushes the primary action toward the fold on iPad
        landscape).
      */}
      <div className="flex flex-col gap-md">
        <DurationStepper
          duration={staging.durationMinutes}
          maxDuration={maxDuration}
          atCeiling={atCeiling}
          onStep={onStep}
          onSetDuration={onSetDuration}
        />

        <QuickAddButtons
          duration={staging.durationMinutes}
          maxDuration={maxDuration}
          onSetDuration={onSetDuration}
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

const DURATION_INPUT_ID = 'duration-input'

/**
 * `[-] [editable number] [+]`, one row, centered (BL-1). The number in the
 * middle is both the stepper's live readout AND the exact-minute entry field
 * that used to be a separate "Set exact minutes" box below it — click (or
 * tab) into it and type an exact value, same as that box did, through the
 * exact same `onSetDuration` -> `setDuration` reducer path (clamps only to
 * [1 minute, continuous-block ceiling], never snaps to the stepper's 5-minute
 * grid). A local "draft" string keeps the field editable (empty, mid-typed)
 * without fighting the committed value while focused; unfocused, it shows
 * the same formatted duration the old read-only `<output>` did.
 */
function DurationStepper({
  duration,
  maxDuration,
  atCeiling,
  onStep,
  onSetDuration,
}: {
  duration: number
  maxDuration: number
  atCeiling: boolean
  onStep: (delta: number) => void
  onSetDuration: (minutes: number) => void
}) {
  // The stepper's floor is a clean multiple of DURATION_STEP_MINUTES (5),
  // never the domain-wide 1-minute floor manual entry uses — otherwise
  // repeatedly decreasing bottoms out at 1 and the next +5 click drifts onto
  // 6, 11, 16... instead of landing back on 5, 10, 15...
  const canDecrease = duration > STEPPER_MIN_DURATION_MINUTES
  const canIncrease = duration < maxDuration

  const [draft, setDraft] = useState(String(duration))
  const [focused, setFocused] = useState(false)

  // Stay in sync with duration changes from the +/-5 buttons, quick-add
  // buttons, or switching the staged activity — but never while the user is
  // actively typing, or every keystroke's dispatch would overwrite what
  // they're mid-way through entering.
  useEffect(() => {
    if (!focused) setDraft(String(duration))
  }, [duration, focused])

  function commitDraft() {
    const parsed = Number.parseInt(draft, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      onSetDuration(parsed)
    } else {
      // Not a valid whole positive number — revert rather than commit garbage.
      setDraft(String(duration))
    }
  }

  const stepButton =
    'flex size-stepper items-center justify-center rounded-full border border-line bg-white text-forest transition-colors hover:border-forest-light disabled:opacity-40 disabled:hover:border-line'

  return (
    <div>
      <p id="duration-label" className="mb-sm text-caption font-semibold text-muted">
        Duration
      </p>
      <div className="flex items-center justify-center gap-lg">
        <button
          type="button"
          onClick={() => onStep(-DURATION_STEP_MINUTES)}
          disabled={!canDecrease}
          aria-label={`Decrease duration by ${DURATION_STEP_MINUTES} minutes`}
          className={stepButton}
        >
          <Minus aria-hidden="true" className="size-[18px]" />
        </button>

        <input
          id={DURATION_INPUT_ID}
          type="text"
          inputMode="numeric"
          aria-labelledby="duration-label"
          aria-describedby={atCeiling ? CAPACITY_MESSAGE_ID : undefined}
          value={focused ? draft : formatDuration(duration)}
          onFocus={(event) => {
            setFocused(true)
            setDraft(String(duration))
            event.currentTarget.select()
          }}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft(event.target.value)}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commitDraft()
              event.currentTarget.blur()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              setDraft(String(duration))
              event.currentTarget.blur()
            }
          }}
          onBlur={() => {
            setFocused(false)
            commitDraft()
          }}
          className="min-w-[64px] max-w-[96px] rounded-sm border-0 bg-transparent text-center font-display text-stepper font-semibold text-charcoal transition-colors hover:bg-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
        />

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

/**
 * R2.4 — additive quick-add buttons. Each adds its labeled amount to
 * whatever duration is currently staged (never sets it outright), through
 * the same clamp `onSetDuration` already applies.
 */
function QuickAddButtons({
  duration,
  maxDuration,
  onSetDuration,
}: {
  duration: number
  maxDuration: number
  onSetDuration: (minutes: number) => void
}) {
  return (
    <div role="group" aria-label="Add time to duration" className="flex flex-wrap gap-sm">
      {QUICK_ADD_OPTIONS.map((option) => {
        const disabled = duration >= maxDuration
        return (
          <button
            key={option.label}
            type="button"
            disabled={disabled}
            onClick={() => onSetDuration(duration + option.minutes)}
            aria-label={option.description}
            className="rounded-full border border-line bg-white px-md py-xs text-caption font-semibold text-forest transition-colors hover:border-forest-light hover:bg-bg disabled:opacity-40 disabled:hover:border-line disabled:hover:bg-white"
          >
            +{option.label}
          </button>
        )
      })}
    </div>
  )
}
