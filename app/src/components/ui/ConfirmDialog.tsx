import { useId } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Button } from '@/components/ui/button'

/**
 * A small "are you sure?" pop-up for an action that's easy to do by accident.
 * Same dialog shell as the add / edit button form, so it looks like the rest of
 * the app. Cancel is the default focus: Enter or Esc never confirms.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  description?: string
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const titleId = useId()
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onCancel()}>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-black/45" />
      <Dialog.Content
        role="alertdialog"
        aria-labelledby={titleId}
        onOpenAutoFocus={(event) => {
          // Focus the safe choice, not the destructive one.
          event.preventDefault()
          ;(event.currentTarget as HTMLElement).querySelector<HTMLElement>('[data-confirm-cancel]')?.focus()
        }}
        className="fixed left-1/2 top-1/2 z-50 flex w-[min(400px,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col gap-md rounded-lg bg-surface p-lg shadow-elevation-2 focus:outline-none"
      >
        <Dialog.Title id={titleId} className="text-h1-sm font-semibold text-ink">
          {title}
        </Dialog.Title>
        {description ? (
          <Dialog.Description className="text-body text-ink-dim">{description}</Dialog.Description>
        ) : (
          <Dialog.Description className="sr-only">{title}</Dialog.Description>
        )}
        <div className="flex items-center justify-end gap-sm">
          <Button type="button" variant="ghost" data-confirm-cancel="" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="button" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  )
}
