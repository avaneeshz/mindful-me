import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { REFLECTION_CARDS } from '@/data/reflectionCards'
import type { ActivityList } from '@/domain/types'
import { cn } from '@/lib/utils'

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
 * With no activity selected, tapping a card can't map anything — it shows a
 * one-line inline hint instead of silently doing nothing.
 */
export function ReflectionSection({
  activities,
  selectedActivityId,
  onRequestMapping,
}: {
  activities: ActivityList
  selectedActivityId: string | null
  /** Tap path — the caller (`TodayPage`) only acts on this when an activity is actually selected. */
  onRequestMapping: (card: number) => void
}) {
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
        Reflection
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
        aria-label="Reflection cards"
        className="mt-xl grid grid-cols-9 gap-md mobile:mt-lg mobile:grid-cols-3 mobile:gap-sm"
      >
        {REFLECTION_CARDS.map((card) => {
          const isMapped = mappedCards.has(card.number)
          return (
            <button
              key={card.number}
              type="button"
              onClick={() => handleCardClick(card.number)}
              aria-pressed={isMapped}
              aria-label={
                isMapped
                  ? `${card.title} — mapped to ${selected?.name}, tap to edit or remove`
                  : selected
                    ? `${card.title} — tap to map to ${selected.name}`
                    : card.title
              }
              className={cn(
                'relative flex flex-col overflow-hidden rounded-md border bg-surface text-left transition-colors',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                isMapped ? 'border-ink ring-2 ring-ink' : 'border-line hover:border-ink hover:shadow-elevation-2',
              )}
            >
              <div className="aspect-[4/3] w-full overflow-hidden bg-surface-2">
                <img src={card.image} alt="" className="size-full object-cover" />
              </div>
              <p className="border-t border-line px-sm py-sm text-center text-note font-semibold leading-snug text-ink">
                {card.title}
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
