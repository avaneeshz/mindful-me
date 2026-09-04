import { useEffect, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { Minus, Plus } from 'lucide-react'
import { DURATION_STEP_MINUTES } from '@/domain/scheduling'
import { cn } from '@/lib/utils'

/**
 * The numeric +/- stepper and quick-add buttons, extracted verbatim from the
 * retired `StagingPane.tsx` side panel. Debug/comparison fallback only —
 * gated behind `SHOW_DURATION_STEPPER_FALLBACK` (see `lib/featureFlags.ts`),
 * mutually exclusive with `DurationDragBlock`. Dispatches through the exact
 * same `stepDuration`/`setDuration` reducer actions the drag-block uses —
 * no duplicate duration logic between the two.
 */

export const CAPACITY_MESSAGE_ID = 'staging-capacity-message'

/** The stepper's own floor — see `clampStepDuration` in domain/scheduling.ts. */
const STEPPER_MIN_DURATION_MINUTES = DURATION_STEP_MINUTES

const QUICK_ADD_OPTIONS: Array<{ label: string; minutes: number; description: string }> = [
  { label: '30min', minutes: 30, description: 'Add 30 minutes to duration' },
  { label: '1hr', minutes: 60, description: 'Add 1 hour to duration' },
  { label: '2hr', minutes: 120, description: 'Add 2 hours to duration' },
]

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`
}

export function DurationStepperFallback({
  duration,
  maxDuration,
  onStep,
  onSetDuration,
}: {
  duration: number
  maxDuration: number
  onStep: (delta: number) => void
  onSetDuration: (minutes: number) => void
}) {
  const atCeiling = duration >= maxDuration
  return (
    <div className="flex flex-col gap-md">
      <DurationStepper
        duration={duration}
        maxDuration={maxDuration}
        atCeiling={atCeiling}
        onStep={onStep}
        onSetDuration={onSetDuration}
      />
      <QuickAddButtons duration={duration} maxDuration={maxDuration} onSetDuration={onSetDuration} />
      {atCeiling && (
        <p id={CAPACITY_MESSAGE_ID} role="status" className="text-note font-medium text-ink">
          Capped at {formatDuration(maxDuration)} — the next activity begins there.
        </p>
      )}
    </div>
  )
}

const DURATION_INPUT_ID = 'duration-input'

/**
 * `[-] [editable number] [+]`, one row, centered. The number in the middle is
 * both the stepper's live readout AND the exact-minute entry field — click
 * (or tab) into it and type an exact value, through the same `onSetDuration`
 * -> `setDuration` reducer path (clamps only to [1 minute, continuous-block
 * ceiling], never snaps to the stepper's 5-minute grid). A local "draft"
 * string keeps the field editable without fighting the committed value while
 * focused; unfocused, it shows the same formatted duration.
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
    'flex size-stepper items-center justify-center rounded-full border border-line bg-surface text-ink transition-colors hover:border-ink disabled:opacity-40 disabled:hover:border-line'

  return (
    <div>
      <p id="duration-label" className="mb-sm text-caption font-semibold text-ink-dim">
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
          className="min-w-[64px] max-w-[96px] rounded-sm border-0 bg-transparent text-center font-display text-stepper font-semibold text-ink transition-colors hover:bg-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
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
 * Additive quick-add buttons. Each adds its labeled amount to whatever
 * duration is currently staged (never sets it outright), through the same
 * clamp `onSetDuration` already applies.
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
            className="rounded-full border border-line bg-surface px-md py-xs text-caption font-semibold text-ink transition-colors hover:border-ink hover:bg-bg disabled:opacity-40 disabled:hover:border-line disabled:hover:bg-surface"
          >
            +{option.label}
          </button>
        )
      })}
    </div>
  )
}
