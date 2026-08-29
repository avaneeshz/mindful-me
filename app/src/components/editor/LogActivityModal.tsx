import { ChevronDown, X } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { findCard } from '@/data/activities'
import { SHOW_DURATION_STEPPER_FALLBACK } from '@/lib/featureFlags'
import { stagingOptions, type StagingState } from '@/state/boardReducer'
import type { ActivityList, ActivityQuality, FlagId } from '@/domain/types'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { cn } from '@/lib/utils'
import { DurationDragBlock } from './DurationDragBlock'
import { DurationStepperFallback } from './DurationStepperFallback'
import { FlagPicker } from './FlagPicker'
import { QualityPicker } from './QualityPicker'

/**
 * The log-activity popup (Modal Redesign §B) — replaces the old always-open
 * side panel (`StagingPane`, retired) as the ONE place duration, sub-option
 * drill-down, "how did it feel", and the activity's flag are all set,
 * top to bottom, before Save commits everything through the exact same
 * `commit` reducer action the side panel always used.
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
  onSetQuality,
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
  onSetQuality: (quality: ActivityQuality | null) => void
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
      <Dialog.Overlay className="fixed inset-0 z-40 bg-charcoal/40" />
      <Dialog.Content
          // Full-screen sheet on mobile, centered dialog from tablet up — the
          // standard Radix Dialog responsive shape, matching how the rest of
          // this app already adapts by breakpoint.
          className={cn(
            'fixed z-50 flex flex-col gap-lg overflow-y-auto bg-white p-lg shadow-elevation-2 focus:outline-none',
            'inset-0 mobile:inset-0',
            'ipad-land:inset-x-auto ipad-land:inset-y-1/2 ipad-land:left-1/2 ipad-land:top-1/2',
            'md:inset-auto md:left-1/2 md:top-1/2 md:w-[min(480px,92vw)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg',
          )}
        >
          {!card && <Dialog.Title className="sr-only">Log activity</Dialog.Title>}
          <Dialog.Description className="sr-only">
            Set the duration, how it felt, and any flag for this activity, then save.
          </Dialog.Description>

          {card && (
            <div className="flex items-start justify-between gap-md">
              <div className="min-w-0">
                <Dialog.Title className="text-entry-name font-semibold text-charcoal">
                  {staging.cardName}
                </Dialog.Title>
                {staging.path.length > 0 && (
                  <p className="mt-xs text-caption font-medium text-muted">{staging.path.join(' · ')}</p>
                )}
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close"
                  className="flex size-[32px] shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-bg hover:text-charcoal"
                >
                  <X aria-hidden="true" className="size-[18px]" />
                </button>
              </Dialog.Close>
            </div>
          )}

          {/* Sub/third-level drill-down — the SAME staging/path mechanism as
              before, just relocated from a separate screen into the modal. */}
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

          {!options && staging.cardName && (
            <>
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

              <QualityPicker selected={staging.quality} onSelect={onSetQuality} />
              <FlagPicker selected={staging.flag} onSelect={onSetFlag} />

              {/* Inert stub — a placeholder for a later feature, not wired to
                  anything (Modal Redesign §6). */}
              <div className="flex items-center justify-between rounded-md bg-bg px-md py-sm text-caption font-medium text-muted">
                <span>Explore states · 25 dimensions</span>
                <ChevronDown aria-hidden="true" className="size-[16px]" />
              </div>

              <div className="mt-auto flex flex-col gap-sm pt-md">
                <Button block disabled={!canCommit} onClick={onCommit}>
                  {staging.editingId !== null ? 'Save changes' : 'Save entry'}
                </Button>
                <Button variant="ghost" size="control" block onClick={onCancel}>
                  Cancel
                </Button>
              </div>
            </>
          )}
      </Dialog.Content>
    </Dialog.Root>
  )
}
