import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { AddHeaderButtonChip, EditModeControls, EditModeToggle, HeaderButtonFormDialog } from '@/components/HeaderButtonEditor'
import { NoteButtonPill } from '@/components/NoteButtonPill'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { UpdateHeaderButtonInput } from '@/api/headerButtons'
import type { NewHeaderButtonInput } from '@/domain/headerButtonForm'
import type { HeaderButtonCategory, HeaderButtonConfig } from '@/domain/headerButtons'
import { newTileNoteKey } from '@/domain/notes'
import { useSharedHeaderButtons } from '@/state/HeaderButtonsContext'
import { cn } from '@/lib/utils'

/**
 * The full-screen window a State Tile opens. It is the header's row of note
 * buttons on a bigger canvas: **Add content** creates a new note button
 * (a name, plus optional types) and each button opens the same write-a-note
 * popover with its own history, edit and remove (`NoteButtonPill`). Buttons
 * and notes are stored exactly like the header's — `header_buttons` rows and
 * `note_entries` — only keyed `tile<card>_…` so they appear here and not in
 * the header. That is what lets a header note button be moved onto a tile
 * later by re-keying it.
 *
 * Deliberately no `Dialog.Portal`, same reason as `LogActivityModal`: this
 * app's tests are server-rendered strings and portalled content never
 * appears in them.
 */
export function StateTileNotesWindow({
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
  const { tileButtons, addButton, updateButton, hideButton } = useSharedHeaderButtons()
  const buttons = tileButtons(card)
  const [editMode, setEditMode] = useState(false)
  const [formMode, setFormMode] = useState<null | { kind: 'add' } | { kind: 'edit'; button: HeaderButtonConfig }>(null)
  const [pendingDelete, setPendingDelete] = useState<HeaderButtonConfig | null>(null)

  function handleOpenChange(next: boolean) {
    if (!next) {
      setEditMode(false)
      setFormMode(null)
    }
    onOpenChange(next)
  }

  function handleCreate(input: NewHeaderButtonInput) {
    addButton({ ...input, category: 'notes', key: newTileNoteKey(card) })
  }

  function handleUpdate(input: UpdateHeaderButtonInput & { category: HeaderButtonCategory }) {
    updateButton(input)
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Content
        aria-describedby={undefined}
        className={cn(
          'fixed inset-0 z-50 flex flex-col bg-bg focus:outline-none',
          '[padding-top:env(safe-area-inset-top)] [padding-bottom:env(safe-area-inset-bottom)]',
        )}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <header className="flex items-center justify-between gap-md border-b border-line bg-surface px-xl py-md mobile:px-lg">
          <Dialog.Title className="min-w-0 truncate font-display text-h1-sm font-semibold text-ink">{title}</Dialog.Title>
          <div className="flex shrink-0 items-center gap-sm">
            {buttons.length > 0 && <EditModeToggle active={editMode} onToggle={() => setEditMode((v) => !v)} />}
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
          <div className="mx-auto flex w-full max-w-[960px] flex-col gap-lg px-xl py-xl mobile:px-lg mobile:py-lg">
            {buttons.length === 0 ? (
              <div className="flex flex-col items-start gap-md rounded-md border border-dashed border-line p-xl">
                <div className="flex flex-col gap-xs">
                  <p className="text-body font-semibold text-ink">Nothing here yet</p>
                  <p className="text-caption text-ink-dim">
                    Add content to create a button. Tap it to write a note; every note is kept with its date and time.
                  </p>
                </div>
                <AddHeaderButtonChip label="Add content" onClick={() => setFormMode({ kind: 'add' })} />
              </div>
            ) : (
              // Room beneath for a note popover to open into.
              <div className="flex flex-wrap items-center gap-sm pb-[480px] mobile:pb-[360px]">
                {buttons.map((button) => (
                  <span key={button.id} className="relative inline-flex">
                    <NoteButtonPill buttonKey={button.key ?? button.id} label={button.label} />
                    {editMode && (
                      <EditModeControls
                        button={button}
                        onEdit={() => setFormMode({ kind: 'edit', button })}
                        onDelete={() => setPendingDelete(button)}
                      />
                    )}
                  </span>
                ))}
                <AddHeaderButtonChip label="Add content" onClick={() => setFormMode({ kind: 'add' })} />
              </div>
            )}
          </div>
        </div>

        <ConfirmDialog
          open={pendingDelete !== null}
          title="Are you sure you want to delete this button?"
          description={pendingDelete ? `“${pendingDelete.label}” will be removed from ${title}.` : undefined}
          confirmLabel="Delete"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            if (pendingDelete) hideButton(pendingDelete.id)
            setPendingDelete(null)
          }}
        />

        {formMode && (
          <HeaderButtonFormDialog
            mode={formMode.kind === 'add' ? { kind: 'add', groupId: '', category: 'notes' } : formMode}
            groups={[]}
            lockCategory
            onClose={() => setFormMode(null)}
            onCreate={handleCreate}
            onUpdate={handleUpdate}
          />
        )}
      </Dialog.Content>
    </Dialog.Root>
  )
}
