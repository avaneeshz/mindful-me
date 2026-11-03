import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { EditOverlay } from '@/components/editor/EditOverlay'
import { CardEditPanel } from '@/components/editor/CardEditPanel'
import { CardNotesPanel } from '@/components/editor/CardNotesPanel'
import { useReflectionCards } from '@/state/useReflectionCards'
import { REFLECTION_CARDS } from '@/data/reflectionCards'
import { cn } from '@/lib/utils'
import { sectionName } from '@/domain/appLanguage'

/**
 * The home-screen State Tiles section — the 18-card grid.
 *
 * Tap a tile to open its notes: a box to write a new note and, underneath,
 * every earlier note written on that tile with the date and time it was
 * written, each editable (`CardNotesPanel`). Notes belong to the tile and the
 * signed-in account; they are not mapped to an activity.
 *
 * In Edit mode a tap opens the tile's editor instead — its name and picture
 * (`CardEditPanel`). Both belong to the signed-in account.
 */
export function ReflectionSection({ editMode = false }: { editMode?: boolean }) {
  const { nameFor, imageFor } = useReflectionCards()
  const [openCard, setOpenCard] = useState<number | null>(null)

  return (
    <section
      aria-labelledby="reflection-heading"
      className="rounded-lg border border-line bg-surface p-2xl shadow-elevation-1 mobile:p-lg ipad-land:p-lg"
    >
      <h2 id="reflection-heading" className="font-display text-slot-time font-semibold text-ink">
        {sectionName('stateTiles')}
      </h2>

      <div
        role="group"
        aria-label={sectionName('stateTiles')}
        className="mt-xl grid grid-cols-9 gap-md mobile:mt-lg mobile:grid-cols-3 mobile:gap-sm"
      >
        {REFLECTION_CARDS.map((card) => {
          const title = nameFor(card.number)
          const isOpen = openCard === card.number
          return (
            <EditOverlay
              key={card.number}
              open={isOpen}
              onOpenChange={(next) => setOpenCard(next ? card.number : null)}
              label={editMode ? `Edit ${title}` : `Notes: ${title}`}
              anchor={
                <div className="relative min-w-0">
                  <button
                    type="button"
                    onClick={() => setOpenCard(card.number)}
                    aria-label={editMode ? `Edit ${title}` : `${title} — notes`}
                    aria-expanded={isOpen}
                    className={cn(
                      'flex w-full flex-col overflow-hidden rounded-md border bg-surface text-left transition-colors',
                      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                      isOpen ? 'border-ink ring-2 ring-ink' : editMode ? 'border-dashed border-line hover:border-ink' : 'border-line hover:border-ink hover:shadow-elevation-2',
                    )}
                  >
                    <div className="aspect-[4/3] w-full overflow-hidden bg-surface-2">
                      <img src={imageFor(card.number)} alt="" className="size-full object-cover" />
                    </div>
                    <p className="border-t border-line px-sm py-sm text-center text-note font-semibold leading-snug text-ink">{title}</p>
                  </button>
                  {editMode && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute left-xs top-xs flex size-[24px] items-center justify-center rounded-full border border-line bg-surface text-ink-dim"
                    >
                      <Pencil className="size-[12px]" />
                    </span>
                  )}
                </div>
              }
            >
              {editMode ? (
                <CardEditPanel card={card.number} onClose={() => setOpenCard(null)} />
              ) : (
                <CardNotesPanel card={card.number} title={title} open={isOpen} />
              )}
            </EditOverlay>
          )
        })}
      </div>
    </section>
  )
}
