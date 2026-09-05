import { X } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { findCard } from '@/data/activities'
import { SHOW_DURATION_STEPPER_FALLBACK } from '@/lib/featureFlags'
import { stagingOptions, type StagingState } from '@/state/boardReducer'
import type { ActivityList, ActivityQuality, FlagId, Symptom } from '@/domain/types'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { cn } from '@/lib/utils'
import { DurationDragBlock } from './DurationDragBlock'
import { DurationStepperFallback } from './DurationStepperFallback'
import { FlagPicker } from './FlagPicker'
import { QualityPicker } from './QualityPicker'
import { SymptomsPicker } from './SymptomsPicker'

/**
 * The log-activity popup (Modal Redesign §B, refined further this round) —
 * the ONE place duration, sub-option drill-down, activity quality, chronic
 * symptoms, protective response, and freeform notes are all set, together in
 * one view, before Save commits everything through the exact same `commit`
 * reducer action the old side panel always used.
 *
 * `staging.cardName !== null` IS "is the modal open" — no separate open/
 * closed boolean anywhere. A timeline drop still opens this same modal,
 * pre-populated, via the unchanged `dropCard` -> `selectSlot` + `pickCard`
 * pipeline (`boardReducer.ts`).
 */
export function LogActivityModal({
  staging,
  activities,
  maxDuration,
  canCommit,
  onPickOption,
  onStep,
  onSetDuration,
  onMove,
  onResizeStart,
  onSetFlag,
  onToggleQuality,
  onToggleSymptom,
  onSetNotes,
  onCommit,
  onCancel,
}: {
  staging: StagingState
  activities: ActivityList
  maxDuration: number
  canCommit: boolean
  onPickOption: (level: number, value: string) => void
  onStep: (delta: number) => void
  onSetDuration: (minutes: number) => void
  onMove: (minutes: number) => void
  onResizeStart: (minutes: number) => void
  onSetFlag: (flag: FlagId | null) => void
  onToggleQuality: (quality: ActivityQuality) => void
  onToggleSymptom: (symptom: Symptom) => void
  onSetNotes: (notes: string) => void
  onCommit: () => void
  onCancel: () => void
}) {
  const isOpen = staging.cardName !== null
  const card = staging.cardName ? findCard(staging.cardName) : undefined
  const options = stagingOptions(staging)

  return (
    // Deliberately NO `<Dialog.Portal>`: this whole app's test suite is
    // SSR-string assertions (`renderToStaticMarkup`), and a portal's content
    // renders into a real DOM node that plain server rendering never
    // produces — it would silently vanish from every test (and from a
    // static-render preview) despite `open` being true. Radix's Portal is
    // optional; Content works identically without it, just inline in the
    // document instead of teleported to <body> — `position: fixed` still
    // positions against the viewport either way.
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      {/* A fixed, theme-independent scrim — deliberately not `ink`-based:
          this dims the page behind the modal in both themes identically,
          the same reasoning the reference implementation's own overlay
          uses (a plain black wash, regardless of light/dark). */}
      <Dialog.Overlay className="fixed inset-0 z-40 bg-black/45" />
      <Dialog.Content
        // Wide, not tall (mockup reference: 760px) — a short sheet on
        // iPad-landscape/desktop, height driven by content, not the other
        // way around. Full-screen on mobile, same as before.
        //
        // Deliberately no `ipad-land:` override: that breakpoint's usual
        // `inset-y-1/2` pattern (used elsewhere to tighten vertical spacing)
        // pins BOTH `top` and `bottom` to 50%, which zeroes this box's height
        // outright since it relies on content-driven `height: auto`
        // (`ipad-land:` is emitted after `md:` in Tailwind's stylesheet, so
        // it would win the cascade whenever both match — any landscape
        // window down to 900px tall, real iPad-landscape included). `md:`
        // alone already centers it with a content-driven height, which is
        // exactly the "short sheet" this needs. `md:max-h-[85vh]` bounds it
        // on genuinely short screens, so the `overflow-y-auto` above has a
        // constrained box to actually scroll within.
        className={cn(
          'fixed z-50 flex flex-col gap-lg overflow-y-auto bg-surface p-lg shadow-elevation-2 focus:outline-none',
          'inset-0 mobile:inset-0',
          'md:inset-auto md:left-1/2 md:top-1/2 md:w-[min(760px,92vw)] md:max-h-[85vh] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg',
        )}
      >
        {!card && <Dialog.Title className="sr-only">Log activity</Dialog.Title>}
        <Dialog.Description className="sr-only">
          Set the duration, activity quality, any chronic symptoms, protective response, and notes for this
          activity, then save.
        </Dialog.Description>

        {card && (
          <div className="flex items-start justify-between gap-md">
            {/* The tile-name subtitle under the activity name is gone this
                round — the name alone is the header now. */}
            <Dialog.Title className="min-w-0 text-entry-name font-semibold text-ink">
              {staging.cardName}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="flex size-[32px] shrink-0 items-center justify-center rounded-full text-ink-dim transition-colors hover:bg-bg hover:text-ink"
              >
                <X aria-hidden="true" className="size-[18px]" />
              </button>
            </Dialog.Close>
          </div>
        )}

        {/* Sub/third-level drill-down chips — the SAME staging/path
            mechanism as before, just relocated from a separate screen into
            the modal. Shown TOGETHER with duration/quality/symptoms/flag
            below, not as a sequential either/or step. */}
        {options && (
          <div className="flex flex-wrap gap-sm">
            {options.options.map((option) => {
              const isSelected = staging.path[options.level] === option
              return (
                <Chip
                  key={option}
                  as="button"
                  size="md"
                  tone={isSelected ? 'active' : 'surface'}
                  interactive
                  aria-pressed={isSelected}
                  onClick={() => onPickOption(options.level, option)}
                >
                  {option}
                </Chip>
              )
            })}
          </div>
        )}

        {staging.cardName && (
          <>
            {/* No "Duration" section label above the ruler any more — it
                shows directly, unlabeled (still named for assistive tech;
                see `DurationDragBlock`'s own `sr-only` label). The dividers
                that used to sit immediately before/after this block are
                already gone — nothing to remove here. */}
            {SHOW_DURATION_STEPPER_FALLBACK ? (
              <DurationStepperFallback
                duration={staging.durationMinutes}
                maxDuration={maxDuration}
                onStep={onStep}
                onSetDuration={onSetDuration}
              />
            ) : (
              <DurationDragBlock
                activities={activities}
                cardName={staging.cardName}
                startMinutes={staging.startMinutes}
                durationMinutes={staging.durationMinutes}
                editingId={staging.editingId}
                onMove={onMove}
                onResizeStart={onResizeStart}
                onSetDuration={onSetDuration}
              />
            )}

            <QualityPicker selected={staging.quality} onToggle={onToggleQuality} />
            <SymptomsPicker selected={staging.symptoms} onToggle={onToggleSymptom} />
            <FlagPicker selected={staging.flag} onSelect={onSetFlag} />

            {/* Notes — a real, always-visible field now (was the inert
                "Deep log" stub). No expand/collapse, no separate heading —
                the textarea's own placeholder carries the label. Persisted
                like quality/flags/symptoms, encrypted at rest (rule 10). */}
            <textarea
              value={staging.notes}
              onChange={(event) => onSetNotes(event.target.value)}
              placeholder="Add notes"
              rows={3}
              className="w-full resize-y rounded-md border border-line bg-bg px-md py-sm text-note text-ink placeholder:text-ink-dim focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            />

            {/* Save: a small centered pill, not a full-width bar. Cancel is
                gone — the X close icon above is the only way to dismiss
                without saving. */}
            <div className="mt-auto flex justify-center pt-md">
              <Button disabled={!canCommit} onClick={onCommit} className="rounded-full px-2xl">
                {staging.editingId !== null ? 'Save changes' : 'Save entry'}
              </Button>
            </div>
          </>
        )}
      </Dialog.Content>
    </Dialog.Root>
  )
}
