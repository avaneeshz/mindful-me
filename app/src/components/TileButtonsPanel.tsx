import { useEffect, useMemo, useState } from 'react'
import { ChecklistButton } from '@/components/ChecklistButton'
import { DisplayValueButton } from '@/components/DisplayValueButton'
import { AddHeaderButtonChip, HeaderButtonFormDialog } from '@/components/HeaderButtonEditor'
import { HeaderButtonBoard } from '@/components/HeaderButtonBoard'
import { NoteButtonPill } from '@/components/NoteButtonPill'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { chipVariants } from '@/components/ui/chip'
import type { UpdateHeaderButtonInput } from '@/api/headerButtons'
import { setDisplayButtonsRegistry } from '@/domain/displayButtons'
import type { NewHeaderButtonInput } from '@/domain/headerButtonForm'
import {
  HEADER_BUTTON_CATEGORIES,
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

/** A State Tile (or page) holds every kind of header button except Quick activity when adding. */
const TILE_BUTTON_CATEGORIES = HEADER_BUTTON_CATEGORIES.filter((c) => c !== 'activity')

type FormMode = null | { kind: 'add'; groupId: string } | { kind: 'edit'; button: HeaderButtonConfig }

/**
 * One State Tile's (or page's) buttons: its own categories, the same Edit mode
 * with drag-to-arrange (and the same moves by tapping), add, edit, delete and
 * restore. Shared by the State Tile window and the sidebar's button pages so the
 * two can never drift apart. The buttons are stored like the header's but carry
 * `card` as their tile number, so they never show in the header.
 *
 * `title` names the place in copy ("removed from Dashboard"); `onEditActivity`
 * is where a quick-activity button's session history sends an edit — the log
 * form lives on Today, so each host decides how to get there.
 */
export function TileButtonsPanel({
  card,
  title,
  editMode,
  onEditActivity,
}: {
  card: number
  title: string
  editMode: boolean
  onEditActivity: (activityId: string) => void
}) {
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
  const { state, viewedDate, logQuickLog } = useBoard()
  const board = tileBoard(card)
  const rows = useMemo(() => groupHeaderButtons(board.groups, board.visible), [board.groups, board.visible])
  const [formMode, setFormMode] = useState<FormMode>(null)
  const [pendingDelete, setPendingDelete] = useState<HeaderButtonConfig | null>(null)

  // Every tile has at least one category to put a button in.
  useEffect(() => {
    ensureTileGroup(card)
  }, [ensureTileGroup, card])

  // The button components read their config from these registries (see `HeaderBar`); this panel may open
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
      {rows.length === 0 ? (
        <p className="text-caption text-ink-dim">{status === 'error' ? 'Could not load your buttons.' : 'Loading your buttons…'}</p>
      ) : (
        <>
          {!hasButtons && !editMode && (
            <div className="flex flex-col items-start gap-md rounded-md border border-dashed border-line p-xl">
              <div className="flex flex-col gap-xs">
                <p className="text-body font-semibold text-ink">No buttons yet</p>
                <p className="text-caption text-ink-dim">
                  Add a button to tick a checklist, keep a daily number or write notes for {title}.
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
                  onEditActivity={onEditActivity}
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
          categories={TILE_BUTTON_CATEGORIES}
          onClose={() => setFormMode(null)}
          onCreate={handleCreate}
          onUpdate={handleUpdate}
        />
      )}
    </>
  )
}
