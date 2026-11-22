import { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { ChecklistButton } from '@/components/ChecklistButton'
import { DisplayValueButton } from '@/components/DisplayValueButton'
import { AddHeaderButtonChip, EditModeToggle, HeaderButtonFormDialog } from '@/components/HeaderButtonEditor'
import { HeaderButtonBoard } from '@/components/HeaderButtonBoard'
import { NoteButtonPill } from '@/components/NoteButtonPill'
import { CardNotesPanel } from '@/components/editor/CardNotesPanel'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { chipVariants } from '@/components/ui/chip'
import type { UpdateHeaderButtonInput } from '@/api/headerButtons'
import { setDisplayButtonsRegistry } from '@/domain/displayButtons'
import type { NewHeaderButtonInput } from '@/domain/headerButtonForm'
import {
  groupHeaderButtons,
  layoutAfterMove,
  layoutFromRows,
  toDisplayButtonLike,
  type HeaderButtonCategory,
  type HeaderButtonConfig,
} from '@/domain/headerButtons'
import { newTileNoteKey, setNoteButtonsRegistry, setNoteButtonTypesRegistry } from '@/domain/notes'
import { useBoard } from '@/state/BoardContext'
import { useSharedHeaderButtons } from '@/state/HeaderButtonsContext'
import { cn } from '@/lib/utils'

/**
 * The full-screen window every State Tile opens. It is the header's own
 * button system on a bigger canvas, for this one tile: the same four kinds of
 * button (quick activity, checklist, content entry, daily number), the same
 * named categories, the same Edit mode with drag-to-arrange (and the same moves
 * by tapping), add, edit and delete. The buttons are the tile's alone — they
 * are stored like the header's (`header_buttons` rows) but carry the tile's
 * number, so they never appear in the header, and the header's never appear here.
 *
 * The tile's older free-form notes (the box that used to open on tap) are kept
 * below the buttons.
 *
 * Deliberately no `Dialog.Portal`, same reason as `LogActivityModal`: this
 * app's tests are server-rendered strings and portalled content never
 * appears in them. The body is only mounted while open, so a closed tile
 * costs nothing and needs no board.
 */
export function StateTileWindow({
  card,
  title,
  open,
  onOpenChange,
}: {
  card: number
  title: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content
        aria-describedby={undefined}
        className={cn(
          'fixed inset-0 z-50 flex flex-col bg-bg focus:outline-none',
          '[padding-top:env(safe-area-inset-top)] [padding-bottom:env(safe-area-inset-bottom)]',
        )}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <StateTileWindowBody card={card} title={title} onClose={() => onOpenChange(false)} />
      </Dialog.Content>
    </Dialog.Root>
  )
}

type FormMode = null | { kind: 'add'; groupId: string } | { kind: 'edit'; button: HeaderButtonConfig }

function StateTileWindowBody({ card, title, onClose }: { card: number; title: string; onClose: () => void }) {
  const {
    allButtons,
    noteButtons,
    tileBoard,
    ensureTileGroup,
    notice,
    addButton,
    updateButton,
    hideButton,
    unhideButton,
    arrange,
    addGroup,
    renameGroup,
    deleteGroup,
    reorderGroups,
    status,
  } = useSharedHeaderButtons()
  const { state, dispatch, viewedDate, logQuickLog } = useBoard()
  const board = tileBoard(card)
  const rows = useMemo(() => groupHeaderButtons(board.groups, board.visible), [board.groups, board.visible])
  const [editMode, setEditMode] = useState(false)
  const [formMode, setFormMode] = useState<FormMode>(null)
  const [pendingDelete, setPendingDelete] = useState<HeaderButtonConfig | null>(null)

  // Every tile has at least one category to put a button in.
  useEffect(() => {
    ensureTileGroup(card)
  }, [ensureTileGroup, card])

  // The button components read their config from these registries (see `HeaderBar`); this window may open
  // before the header has rendered with this tile's buttons in it, so it fills them in itself, with the same data.
  setDisplayButtonsRegistry(allButtons.filter((b) => b.category === 'activity' || b.category === 'day_value').map(toDisplayButtonLike))
  setNoteButtonsRegistry(noteButtons.map((b) => ({ key: b.key ?? b.id, label: b.label })))
  setNoteButtonTypesRegistry(Object.fromEntries(noteButtons.map((b) => [b.key ?? b.id, b.noteTypes])))

  function handleCreate(input: NewHeaderButtonInput, groupId: string) {
    // A tile's note buttons keep the `tile<card>_…` storage key, as the Decisions tile's always have.
    addButton({ ...input, tileCard: card, ...(input.category === 'notes' ? { key: newTileNoteKey(card) } : {}) }, groupId)
  }

  function handleUpdate(input: UpdateHeaderButtonInput & { category: HeaderButtonCategory }, groupId: string) {
    updateButton(input)
    // The form's Category picker is the tap way to move a button between categories.
    const current = rows.find((row) => row.buttons.some((b) => b.id === input.id))?.group.id
    if (current && current !== groupId) arrange(layoutAfterMove(layoutFromRows(rows), input.id, groupId))
  }

  const hasButtons = board.visible.length > 0
  const firstGroup = board.groups[0]

  return (
    <>
      <header className="flex items-center justify-between gap-md border-b border-line bg-surface px-xl py-md mobile:px-lg">
        <Dialog.Title className="min-w-0 truncate font-display text-h1-sm font-semibold text-ink">{title}</Dialog.Title>
        <div className="flex shrink-0 items-center gap-sm">
          <EditModeToggle active={editMode} onToggle={() => setEditMode((v) => !v)} />
          <Dialog.Close asChild>
            <button
              type="button"
              aria-label={`Close ${title}`}
              className="flex size-stepper items-center justify-center rounded-full text-ink-dim transition-colors hover:bg-bg hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <X aria-hidden="true" className="size-[18px]" />
            </button>
          </Dialog.Close>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[960px] flex-col gap-xl px-xl py-xl mobile:px-lg mobile:py-lg">
          {rows.length === 0 ? (
            <p className="text-caption text-ink-dim">{status === 'error' ? 'Could not load your buttons.' : 'Loading your buttons…'}</p>
          ) : (
            <>
              {!hasButtons && !editMode && (
                <div className="flex flex-col items-start gap-md rounded-md border border-dashed border-line p-xl">
                  <div className="flex flex-col gap-xs">
                    <p className="text-body font-semibold text-ink">No buttons yet</p>
                    <p className="text-caption text-ink-dim">
                      Add a button to log an activity, tick a checklist, keep a daily number or write notes for {title}.
                    </p>
                  </div>
                  {firstGroup && <AddHeaderButtonChip onClick={() => setFormMode({ kind: 'add', groupId: firstGroup.id })} />}
                </div>
              )}

              <HeaderButtonBoard
                rows={rows}
                groups={board.groups}
                editMode={editMode}
                onArrange={arrange}
                onEdit={(button) => setFormMode({ kind: 'edit', button })}
                onDelete={setPendingDelete}
                onAddButton={(group) => setFormMode({ kind: 'add', groupId: group.id })}
                onAddGroup={(name) => addGroup(name, card)}
                onRenameGroup={renameGroup}
                onDeleteGroup={deleteGroup}
                onMoveGroup={(group, direction) => {
                  const ids = board.groups.map((g) => g.id)
                  const from = ids.indexOf(group.id)
                  const to = from + direction
                  if (from === -1 || to < 0 || to >= ids.length) return
                  ;[ids[from], ids[to]] = [ids[to]!, ids[from]!]
                  reorderGroups(ids)
                }}
                renderButton={(button) =>
                  button.category === 'notes' ? (
                    <NoteButtonPill buttonKey={button.key ?? button.id} label={button.label} />
                  ) : button.category === 'checklist' ? (
                    <ChecklistButton button={button} viewedDate={viewedDate} />
                  ) : (
                    <DisplayValueButton
                      buttonKey={button.id}
                      viewedDate={viewedDate}
                      activities={state.activities}
                      onQuickLog={logQuickLog}
                      // The edit form lives on the Today page behind this window, so step out to it.
                      onEditActivity={(id) => {
                        onClose()
                        dispatch({ type: 'editActivity', id })
                      }}
                    />
                  )
                }
              />

              {notice && (
                <p role="status" className="text-caption font-semibold text-ink-dim">
                  {notice}
                </p>
              )}

              {editMode && board.hidden.length > 0 && (
                <section aria-label="Hidden buttons" className="flex flex-col gap-sm border-t border-line-soft pt-md">
                  <h3 className="text-nano font-semibold uppercase tracking-tag text-ink-dim">Hidden</h3>
                  <div className="flex flex-wrap gap-sm">
                    {board.hidden.map((button) => (
                      <button
                        key={button.id}
                        type="button"
                        onClick={() => unhideButton(button.id)}
                        aria-label={`Restore ${button.label}`}
                        className={cn(chipVariants({ tone: 'surface', size: 'sm', interactive: true }), 'font-semibold')}
                      >
                        Restore · {button.label}
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {/* Room beneath for a note or value popover to open into. */}
          <section aria-label={`${title} notes`} className="flex flex-col gap-sm border-t border-line-soft pt-lg">
            <h3 className="text-nano font-semibold uppercase tracking-tag text-ink-dim">Notes</h3>
            <CardNotesPanel card={card} title={title} open />
          </section>
          <div aria-hidden="true" className="h-[320px] mobile:h-[240px]" />
        </div>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Are you sure you want to delete this button?"
        description={pendingDelete ? `“${pendingDelete.label}” will be removed from ${title}. You can restore it while editing.` : undefined}
        confirmLabel="Delete"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) hideButton(pendingDelete.id)
          setPendingDelete(null)
        }}
      />

      {formMode && (
        <HeaderButtonFormDialog
          mode={formMode}
          groups={board.groups}
          onClose={() => setFormMode(null)}
          onCreate={handleCreate}
          onUpdate={handleUpdate}
        />
      )}
    </>
  )
}
