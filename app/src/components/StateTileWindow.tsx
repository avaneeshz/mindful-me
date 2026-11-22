import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { EditModeToggle } from '@/components/HeaderButtonEditor'
import { TileButtonsPanel } from '@/components/TileButtonsPanel'
import { CardNotesPanel } from '@/components/editor/CardNotesPanel'
import { useBoard } from '@/state/BoardContext'
import { cn } from '@/lib/utils'

/**
 * The full-screen window every State Tile opens. It is the header's own
 * button system on a bigger canvas, for this one tile: three of the header's four
 * kinds of button (checklist, content entry, daily number — not quick activity), the same
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

function StateTileWindowBody({ card, title, onClose }: { card: number; title: string; onClose: () => void }) {
  const { dispatch } = useBoard()
  const [editMode, setEditMode] = useState(false)

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
          <TileButtonsPanel
            card={card}
            title={title}
            editMode={editMode}
            // The edit form lives on the Today page behind this window, so step out to it.
            onEditActivity={(id) => {
              onClose()
              dispatch({ type: 'editActivity', id })
            }}
          />

          {/* Room beneath for a note or value popover to open into. */}
          <section aria-label={`${title} notes`} className="flex flex-col gap-sm border-t border-line-soft pt-lg">
            <h3 className="text-nano font-semibold uppercase tracking-tag text-ink-dim">Notes</h3>
            <CardNotesPanel card={card} title={title} open />
          </section>
          <div aria-hidden="true" className="h-[320px] mobile:h-[240px]" />
        </div>
      </div>
    </>
  )
}
