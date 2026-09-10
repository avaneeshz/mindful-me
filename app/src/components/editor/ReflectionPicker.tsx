import { Check } from 'lucide-react'
import { REFLECTION_CARDS } from '@/data/reflectionCards'
import type { ReflectionEntry } from '@/domain/types'
import { cn } from '@/lib/utils'

/**
 * "Reflection" — many-to-many, per-card notes, scoped to THIS logged
 * activity (see the full-stack-engineer agent definition's Phase 3 scope).
 * Replaces the old static `ReflectionSection.tsx` grid (a non-interactive
 * prototype, previously its own section below the whole board) — the real
 * picker lives here instead, in the SAME log-activity modal as quality/
 * symptoms/protective response/notes, because a reflection-card pairing is
 * exactly that kind of per-activity data, not a page-level feature.
 *
 * Selecting a tile adds it (with an empty note); deselecting removes it and
 * its note together. A selected card's own note field appears below the
 * grid, in catalog order — kept separate from the grid itself so the tiles
 * stay a fixed, scannable shape regardless of how much note text anyone
 * types.
 */
export function ReflectionPicker({
  selected,
  onToggle,
  onNoteChange,
}: {
  selected: ReflectionEntry[]
  onToggle: (card: number) => void
  onNoteChange: (card: number, note: string) => void
}) {
  const selectedCards = REFLECTION_CARDS.filter((card) => selected.some((r) => r.card === card.number))

  return (
    <fieldset className="flex flex-col gap-sm">
      <legend className="text-entry-name font-semibold text-ink">Reflection</legend>

      <div role="group" aria-label="Reflection" className="grid grid-cols-9 gap-sm mobile:grid-cols-3">
        {REFLECTION_CARDS.map((card) => {
          const isSelected = selected.some((r) => r.card === card.number)
          return (
            <button
              key={card.number}
              type="button"
              role="checkbox"
              aria-checked={isSelected}
              aria-label={card.title}
              onClick={() => onToggle(card.number)}
              className={cn(
                'relative flex flex-col overflow-hidden rounded-md border bg-surface text-left transition-colors',
                isSelected ? 'border-ink ring-2 ring-ink' : 'border-line hover:border-ink',
              )}
            >
              <div className="aspect-[4/3] w-full overflow-hidden bg-surface-2">
                <img src={card.image} alt="" className="size-full object-cover" />
              </div>
              <p className="border-t border-line px-xs py-xs text-center text-nano font-semibold leading-snug text-ink">
                {card.title}
              </p>
              {isSelected && (
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

      {selectedCards.length > 0 && (
        <div className="flex flex-col gap-sm">
          {selectedCards.map((card) => {
            const entry = selected.find((r) => r.card === card.number)
            return (
              <div key={card.number}>
                <label className="mb-xs block text-caption font-semibold text-ink-dim">{card.title} note</label>
                <textarea
                  value={entry?.note ?? ''}
                  onChange={(event) => onNoteChange(card.number, event.target.value)}
                  placeholder={`Add a note for ${card.title}`}
                  rows={2}
                  className="w-full resize-y rounded-md border border-line bg-bg px-md py-sm text-note text-ink placeholder:text-ink-dim focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                />
              </div>
            )
          })}
        </div>
      )}
    </fieldset>
  )
}
