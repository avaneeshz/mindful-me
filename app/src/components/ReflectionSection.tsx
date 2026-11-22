import { useId, useState } from 'react'
import { ImagePlus, Pencil, Trash2 } from 'lucide-react'
import { EditOverlay } from '@/components/editor/EditOverlay'
import { CardEditPanel } from '@/components/editor/CardEditPanel'
import { NewCardPanel } from '@/components/editor/NewCardPanel'
import { StateTileNotesWindow } from '@/components/StateTileNotesWindow'
import { hasStateTileNotesWindow } from '@/domain/notes'
import { CardNotesPanel } from '@/components/editor/CardNotesPanel'
import { AddCategoryControl, AddHeaderButtonChip, CategoryHeading, EditModeToggle } from '@/components/HeaderButtonEditor'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { HiddenInSettingsLink } from '@/components/settings/HiddenItemsPanel'
import { REORDER_ITEM_ATTR, useSelectableReorder } from '@/components/ui/useSelectableReorder'
import { useEditMode } from '@/state/EditModeContext'
import { useReflectionCards } from '@/state/useReflectionCards'
import { REFLECTION_CARDS } from '@/data/reflectionCards'
import { asCategoryGroups } from '@/domain/reflectionCardGroups'
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
 * In Edit mode tiles can be organised: tap a tile to select it (it wobbles),
 * then drag it — within its category or into another one. The pencil on a
 * tile opens its editor (name, picture, category, position); the bin deletes
 * it. Categories are the user's own named groups, managed the same way the
 * header buttons' are (rename, move, delete, add). Everything dragging does
 * is also a tap in the tile's editor. All of it belongs to the signed-in account.
 */
export function ReflectionSection({ editMode = false }: { editMode?: boolean }) {
  const {
    nameFor,
    imageFor,
    groups,
    rows,
    hiddenCards,
    arrange,
    addGroup,
    renameGroup,
    deleteGroup,
    moveGroup,
    hideCard,
    canAddCard,
  } = useReflectionCards()
  const idBase = useId()
  const { editMode: globalEditMode, toggleStateTilesEdit } = useEditMode()
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)
  /** The category an "Add tile" form is open in. */
  const [addingIn, setAddingIn] = useState<string | null>(null)
  const [openCard, setOpenCard] = useState<number | null>(null)
  const [orderError, setOrderError] = useState<string | null>(null)

  // Failures of a save are shown once, under the section; a new action clears them.
  function report(task: Promise<{ ok: true } | { ok: false; message: string }>) {
    setOrderError(null)
    void task.then((result) => {
      if (!result.ok) setOrderError(result.message)
    })
  }

  // Edit mode: tap a tile to select it (it wobbles), tap more in the same category to add
  // them, then drag — the selection travels together, within a category or into another.
  // A press that doesn't move only selects; the pencil opens the editor, and the editor
  // also has Category and Move earlier / later, so dragging is never the only way.
  const { lanes, draggingId, draggingIds, itemProps, laneRef, isSelected, wobbles, toggleSelected } = useSelectableReorder({
    lanes: rows.map((row) => ({ groupId: row.group.id, buttonIds: row.cards.map(String) })),
    enabled: editMode,
    onCommit: (layout) => report(arrange(layout)),
  })
  const categoryGroups = asCategoryGroups(groups)
  // A category's name only earns a heading when there is more than one, or while editing them.
  const showHeadings = editMode || rows.filter((row) => row.cards.length > 0).length > 1
  const shownCount = rows.reduce((total, row) => total + row.cards.length, 0)

  return (
    <section
      aria-labelledby="reflection-heading"
      className="rounded-lg border border-line bg-surface p-2xl shadow-elevation-1 mobile:p-lg ipad-land:p-lg"
    >
      <div className="flex items-center justify-between gap-md">
        <h2 id="reflection-heading" className="font-display text-slot-time font-semibold text-ink">
          {sectionName('stateTiles')}
        </h2>
        <EditModeToggle
          subject="state tiles"
          active={editMode && !globalEditMode}
          onToggle={toggleStateTilesEdit}
          disabled={globalEditMode}
        />
      </div>

      <div className="mt-xl flex flex-col mobile:mt-lg">
        {rows.map((row, index) => {
          const ids = lanes.find((lane) => lane.groupId === row.group.id)?.buttonIds ?? []
          if (ids.length === 0 && !editMode) return null
          const headingId = `${idBase}-${row.group.id}`
          return (
            <section
              key={row.group.id}
              aria-labelledby={showHeadings ? headingId : 'reflection-heading'}
              className="flex flex-col gap-sm border-t border-line-soft py-md first:border-t-0 first:pt-0 last:pb-0"
            >
              {showHeadings && (
                <CategoryHeading
                  group={categoryGroups[index]!}
                  groups={categoryGroups}
                  buttonCount={row.group.cards.length}
                  index={index}
                  count={rows.length}
                  editMode={editMode}
                  headingId={headingId}
                  noun="tile"
                  onRename={(name) => report(renameGroup(row.group.id, name))}
                  onMove={(direction) => report(moveGroup(row.group.id, direction))}
                  onDelete={() => report(deleteGroup(row.group.id))}
                />
              )}
              <div
                ref={editMode ? laneRef(row.group.id) : undefined}
                role="group"
                aria-label={showHeadings ? row.group.name : sectionName('stateTiles')}
                className={cn('grid grid-cols-9 gap-md mobile:grid-cols-3 mobile:gap-sm', editMode && 'min-h-[96px]')}
              >
                {ids.map((id, position) => {
                  const number = Number(id)
                  const card = REFLECTION_CARDS.find((c) => c.number === number) ?? { number, title: `Card ${number}`, subtitle: '', image: '' }
                  const title = nameFor(card.number)
                  const isOpen = openCard === card.number
                  // A tile with a full-screen notes window opens it instead of the small
                  // popover — except in Edit mode, which still edits the tile itself.
                  const fullScreen = !editMode && hasStateTileNotesWindow(card.number)
                  const selected = editMode && isSelected(id)
                  const dragProps = editMode ? itemProps(id) : null
                  // While several travel together their own slots are placeholders showing where they'll land.
                  const inGroupDrag = draggingIds.length > 1 && draggingIds.includes(id)
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
                            className={cn(
                              'relative min-w-0 select-none rounded-md transition-opacity duration-200',
                              selected && 'shadow-elevation-2',
                              inGroupDrag && 'opacity-40',
                              editMode && draggingId === id && 'shadow-elevation-2',
                            )}
                            {...(dragProps
                              ? {
                                  ref: dragProps.ref,
                                  onPointerDown: dragProps.onPointerDown,
                                  style: dragProps.style,
                                  'data-dragging': dragProps['data-dragging'],
                                  [REORDER_ITEM_ATTR]: '',
                                  'aria-roledescription': 'draggable tile',
                                }
                              : null)}
                          >
                            {/* The wobble sits on this inner element, not the draggable one, so it never
                                fights the drag's own transform. Only selected tiles wobble, and they
                                hold still while being dragged. */}
                            <div
                              className={cn('rounded-md transition-transform duration-200', editMode && wobbles(id) && 'animate-jiggle')}
                              style={editMode ? { animationDelay: `${-(index % 4) * 0.07 - (position % 3) * 0.05}s` } : undefined}
                            >
                              <button
                                type="button"
                                // In Edit mode a press (mouse or finger) is handled by the wrapper — a tap selects,
                                // a drag moves. A click with no pointer (`detail` 0) is the keyboard, so Enter/Space select.
                                onClick={(event) => {
                                  if (!editMode) setOpenCard(card.number)
                                  else if (event.detail === 0) toggleSelected(id)
                                }}
                                aria-label={editMode ? `${title} — select to move` : `${title} — notes`}
                                aria-pressed={editMode ? selected : undefined}
                                aria-expanded={editMode ? undefined : isOpen}
                                className={cn(
                                  'flex w-full flex-col overflow-hidden rounded-md border bg-surface text-left transition-colors',
                                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                                  selected || isOpen
                                    ? 'border-ink ring-2 ring-ink'
                                    : editMode
                                      ? 'border-dashed border-line hover:border-ink'
                                      : 'border-line hover:border-ink hover:shadow-elevation-2',
                                )}
                              >
                                <div className="aspect-[4/3] w-full overflow-hidden bg-surface-2">
                                  {imageFor(card.number) ? (
                                    <img src={imageFor(card.number)} alt="" draggable={false} className="size-full object-cover" />
                                  ) : (
                                    <span aria-hidden="true" className="flex size-full items-center justify-center text-ink-dim">
                                      <ImagePlus className="size-[22px]" />
                                    </span>
                                  )}
                                </div>
                                <p className="border-t border-line px-sm py-sm text-center text-note font-semibold leading-snug text-ink">{title}</p>
                              </button>
                            </div>
                            {fullScreen && (
                              <StateTileNotesWindow
                                card={card.number}
                                title={title}
                                open={isOpen}
                                onOpenChange={(next) => setOpenCard(next ? card.number : null)}
                              />
                            )}
                            {editMode && (
                              <span data-reorder-ignore="">
                                {/* Edit on the top-left corner, Delete on the top-right — the same two corners as the header buttons. */}
                                <button
                                  type="button"
                                  aria-label={`Edit ${title}`}
                                  aria-expanded={isOpen}
                                  onClick={() => setOpenCard(card.number)}
                                  className={cn(cornerControl, 'left-xs')}
                                >
                                  <Pencil aria-hidden="true" className="size-[12px]" />
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Delete ${title}`}
                                  onClick={() => setPendingDelete(card.number)}
                                  className={cn(cornerControl, 'right-xs')}
                                >
                                  <Trash2 aria-hidden="true" className="size-[12px]" />
                                </button>
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
                    open={addingIn === row.group.id}
                    onOpenChange={(next) => setAddingIn(next ? row.group.id : null)}
                    label="Add a tile"
                    anchor={
                      <span data-reorder-ignore="" className="contents">
                        <AddHeaderButtonChip label="Add tile" onClick={() => setAddingIn(row.group.id)} />
                      </span>
                    }
                  >
                    <NewCardPanel groupId={row.group.id} onClose={() => setAddingIn(null)} />
                  </EditOverlay>
                )}
              </div>
            </section>
          )
        })}
        {editMode && (
          <div className="pt-sm" data-reorder-ignore="">
            <AddCategoryControl
              groups={categoryGroups}
              onAdd={(name) => report(addGroup(name))}
            />
          </div>
        )}
      </div>
      {shownCount === 0 && !editMode && (
        <p className="mt-lg text-caption text-ink-dim">
          No tiles are showing. Turn on Edit to add one, or bring deleted tiles back from Settings → Hidden items.
        </p>
      )}
      {editMode && <HiddenInSettingsLink count={hiddenCards.length} noun="state tile" />}
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Are you sure you want to delete this tile?"
        description={
          pendingDelete !== null
            ? `“${nameFor(pendingDelete)}” will be removed from your State Tiles. Its notes are kept, and you can bring it back any time from Settings → Hidden items.`
            : undefined
        }
        confirmLabel="Delete"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const card = pendingDelete
          setPendingDelete(null)
          if (card === null) return
          setOpenCard((open) => (open === card ? null : open))
          report(hideCard(card))
        }}
      />
      {orderError && (
        <p role="alert" className="mt-md text-caption text-ink">
          {orderError}
        </p>
      )}
    </section>
  )
}

/** The small round Edit / Delete controls on a tile's top corners. */
const cornerControl =
  'absolute top-xs z-10 flex size-[24px] items-center justify-center rounded-full border border-line bg-surface text-ink-dim shadow-elevation-1 transition-colors hover:bg-bg hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
