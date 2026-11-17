import { useState } from 'react'
import { ImagePlus, Pencil, Plus } from 'lucide-react'
import { EditOverlay } from '@/components/editor/EditOverlay'
import { CardEditPanel } from '@/components/editor/CardEditPanel'
import { NewCardPanel } from '@/components/editor/NewCardPanel'
import { StateTileNotesWindow } from '@/components/StateTileNotesWindow'
import { hasStateTileNotesWindow } from '@/domain/notes'
import { CardNotesPanel } from '@/components/editor/CardNotesPanel'
import { usePointerReorder } from '@/components/ui/usePointerReorder'
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
  const { nameFor, imageFor, order, reorder, canAddCard } = useReflectionCards()
  const [adding, setAdding] = useState(false)
  const [openCard, setOpenCard] = useState<number | null>(null)
  const [orderError, setOrderError] = useState<string | null>(null)

  // Edit mode drags tiles into a new order with the same pointer drag the
  // header buttons use; a press that doesn't move is a tap and opens the
  // tile's editor. The editor also has Move earlier / later, so dragging is
  // never the only way.
  const { lanes, draggingId, itemProps } = usePointerReorder({
    lanes: [{ groupId: 'state-tiles', buttonIds: order.map(String) }],
    enabled: editMode,
    onCommit: (layout) => {
      setOrderError(null)
      void reorder(layout[0]!.buttonIds.map(Number)).then((result) => {
        if (!result.ok) setOrderError(result.message)
      })
    },
    onTap: (id) => setOpenCard(Number(id)),
  })
  const shown = editMode ? lanes[0]!.buttonIds.map(Number) : order
  // Built-in tiles come with a title and picture; a tile the account added has only what it was given.
  const cards = shown.map((n) => REFLECTION_CARDS.find((c) => c.number === n) ?? { number: n, title: `Card ${n}`, subtitle: '', image: '' })

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
        {cards.map((card) => {
          const title = nameFor(card.number)
          const isOpen = openCard === card.number
          // A tile with a full-screen notes window opens it instead of the small
          // popover — except in Edit mode, which still edits the tile itself.
          const fullScreen = !editMode && hasStateTileNotesWindow(card.number)
          return (
            <EditOverlay
              key={card.number}
              open={isOpen && !fullScreen}
              onOpenChange={(next) => setOpenCard(next ? card.number : null)}
              label={editMode ? `Edit ${title}` : `Notes: ${title}`}
              anchor={
                // The popover's anchor stays a plain, stable element; the drag wrapper (whose
                // ref the drag hook re-creates every render) sits inside it, never on it.
                <div className="relative min-w-0">
                <div
                  className={cn('relative min-w-0 select-none', editMode && draggingId === String(card.number) && 'shadow-elevation-2')}
                  {...(editMode ? itemProps(String(card.number)) : null)}
                  {...(editMode
                    ? {
                        role: 'button',
                        tabIndex: 0,
                        'aria-label': `Edit ${title}`,
                        'aria-roledescription': 'draggable tile',
                        onKeyDown: (e: React.KeyboardEvent) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setOpenCard(card.number)
                          }
                        },
                      }
                    : null)}
                >
                  <button
                    // In Edit mode the wrapper owns the press (drag or tap), so the button itself is inert.
                    {...(editMode ? { inert: true, tabIndex: -1 } : null)}
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
                      {imageFor(card.number) ? (
                        <img src={imageFor(card.number)} alt="" className="size-full object-cover" />
                      ) : (
                        <span aria-hidden="true" className="flex size-full items-center justify-center text-ink-dim">
                          <ImagePlus className="size-[22px]" />
                        </span>
                      )}
                    </div>
                    <p className="border-t border-line px-sm py-sm text-center text-note font-semibold leading-snug text-ink">{title}</p>
                  </button>
                  {fullScreen && (
                    <StateTileNotesWindow
                      card={card.number}
                      title={title}
                      open={isOpen}
                      onOpenChange={(next) => setOpenCard(next ? card.number : null)}
                    />
                  )}
                  {editMode && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute left-xs top-xs flex size-[24px] items-center justify-center rounded-full border border-line bg-surface text-ink-dim"
                    >
                      <Pencil className="size-[12px]" />
                    </span>
                  )}
                </div>
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
        {editMode && canAddCard && (
          <EditOverlay
            open={adding}
            onOpenChange={setAdding}
            label="Add a tile"
            anchor={
              <button
                type="button"
                onClick={() => setAdding(true)}
                aria-label="Add a tile"
                aria-expanded={adding}
                className={cn(
                  'flex h-full min-h-[96px] w-full flex-col items-center justify-center gap-xs rounded-md border border-dashed border-line bg-surface p-sm text-note font-semibold text-ink-dim transition-colors',
                  'hover:border-ink hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                  adding && 'border-ink text-ink',
                )}
              >
                <Plus aria-hidden="true" className="size-[18px]" />
                Add tile
              </button>
            }
          >
            <NewCardPanel onClose={() => setAdding(false)} />
          </EditOverlay>
        )}
      </div>
      {orderError && (
        <p role="alert" className="mt-md text-caption text-ink">
          {orderError}
        </p>
      )}
    </section>
  )
}
