import { useEffect, useState } from 'react'
import { Check, Pencil } from 'lucide-react'
import { EditOverlay } from '@/components/editor/EditOverlay'
import { CardEditPanel } from '@/components/editor/CardEditPanel'
import { useReflectionCards } from '@/state/useReflectionCards'
import { REFLECTION_CARDS } from '@/data/reflectionCards'
import type { ActivityList } from '@/domain/types'
import { cn } from '@/lib/utils'
import { sectionName } from '@/domain/appLanguage'

/**
 * The home-screen reflection section (Frame 2) — a static-positioned section
 * below the slot editor. It is now PURELY the 18-card grid: it never shows a
 * selected activity's details (that summary lives in Frame 1 / `SlotEditor`
 * now — `components/editor/ActivitySummary.tsx`).
 *
 * Mapping a card is tap-only:
 *   1. Select an activity on the timeline (Frame 1 swaps to its summary).
 *   2. Tap a card here — opens the note-entry popup the caller owns
 *      (`onRequestMapping`). Cards already mapped to the selected activity
 *      show a check; re-tapping one reopens the popup to edit or remove it.
 *
 * In Edit mode the cards stop mapping and become renameable instead: tap a
 * card to change its name or its picture. Both belong to the signed-in account.
 *
 * With no activity selected, tapping a card can't map anything — it shows a
 * one-line inline hint instead of silently doing nothing.
 */
export function ReflectionSection({
  activities,
  selectedActivityId,
  onRequestMapping,
  editMode = false,
}: {
  activities: ActivityList
  selectedActivityId: string | null
  /** Tap path — the caller (`TodayPage`) only acts on this when an activity is actually selected. */
  onRequestMapping: (card: number) => void
  /** Edit mode: cards are renamed instead of mapped. */
  editMode?: boolean
}) {
  const { nameFor, imageFor } = useReflectionCards()
  const [renaming, setRenaming] = useState<number | null>(null)
  const selected = selectedActivityId ? activities.find((a) => a.id === selectedActivityId) ?? null : null
  const mappedCards = new Set(selected?.reflections.map((r) => r.card) ?? [])

  const [showHint, setShowHint] = useState(false)
  // Selecting an activity resolves the hint's reason — drop it.
  useEffect(() => {
    if (selected) setShowHint(false)
  }, [selected])

  function handleCardClick(card: number) {
    if (!selected) {
      setShowHint(true)
      return
    }
    onRequestMapping(card)
  }

  return (
    <section
      aria-labelledby="reflection-heading"
      className="rounded-lg border border-line bg-surface p-2xl shadow-elevation-1 mobile:p-lg ipad-land:p-lg"
    >
      <h2 id="reflection-heading" className="font-display text-slot-time font-semibold text-ink">
        {sectionName('stateTiles')}
      </h2>

      {/* The ONLY text under the heading: the warning shown after a card is
          tapped with no activity selected. Nothing otherwise. */}
      {showHint && !selected && (
        <p className="mt-md text-caption font-medium text-ink" role="status" aria-live="polite">
          Select an activity on the timeline first.
        </p>
      )}

      <div
        role="group"
        aria-label={sectionName('stateTiles')}
        className="mt-xl grid grid-cols-9 gap-md mobile:mt-lg mobile:grid-cols-3 mobile:gap-sm"
      >
        {REFLECTION_CARDS.map((card) => {
          const title = nameFor(card.number)
          if (editMode) {
            return (
              <EditOverlay
                key={card.number}
                open={renaming === card.number}
                onOpenChange={(next) => setRenaming(next ? card.number : null)}
                label={`Edit ${title}`}
                anchor={
                  <div className="relative min-w-0">
                    <button
                      type="button"
                      onClick={() => setRenaming(card.number)}
                      aria-label={`Edit ${title}`}
                      aria-expanded={renaming === card.number}
                      className={cn(
                        'flex w-full flex-col overflow-hidden rounded-md border bg-surface text-left transition-colors',
                        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                        renaming === card.number ? 'border-ink ring-2 ring-ink' : 'border-dashed border-line hover:border-ink',
                      )}
                    >
                      <div className="aspect-[4/3] w-full overflow-hidden bg-surface-2">
                        <img src={imageFor(card.number)} alt="" className="size-full object-cover" />
                      </div>
                      <p className="border-t border-line px-sm py-sm text-center text-note font-semibold leading-snug text-ink">{title}</p>
                    </button>
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute left-xs top-xs flex size-[24px] items-center justify-center rounded-full border border-line bg-surface text-ink-dim"
                    >
                      <Pencil className="size-[12px]" />
                    </span>
                  </div>
                }
              >
                <CardEditPanel card={card.number} onClose={() => setRenaming(null)} />
              </EditOverlay>
            )
          }
          const isMapped = mappedCards.has(card.number)
          return (
            <button
              key={card.number}
              type="button"
              onClick={() => handleCardClick(card.number)}
              aria-pressed={isMapped}
              aria-label={
                isMapped
                  ? `${title} — mapped to ${selected?.name}, tap to edit or remove`
                  : selected
                    ? `${title} — tap to map to ${selected.name}`
                    : title
              }
              className={cn(
                'relative flex flex-col overflow-hidden rounded-md border bg-surface text-left transition-colors',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                isMapped ? 'border-ink ring-2 ring-ink' : 'border-line hover:border-ink hover:shadow-elevation-2',
              )}
            >
              <div className="aspect-[4/3] w-full overflow-hidden bg-surface-2">
                <img src={imageFor(card.number)} alt="" className="size-full object-cover" />
              </div>
              <p className="border-t border-line px-sm py-sm text-center text-note font-semibold leading-snug text-ink">
                {title}
              </p>
              {isMapped && (
                <span
                  aria-hidden="true"
                  className="absolute right-xs top-xs flex size-[20px] items-center justify-center rounded-full bg-inv-bg text-inv-ink"
                >
                  <Check className="size-[13px]" />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
