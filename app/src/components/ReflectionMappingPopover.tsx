import { useEffect, useRef, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { REFLECTION_CARDS } from '@/data/reflectionCards'
import type { ActivityList } from '@/domain/types'
import { Button } from '@/components/ui/button'

/** Which activity + card the popup is currently open for. */
export interface PendingReflectionMapping {
  scheduledActivityId: string
  card: number
}

/**
 * The note-entry popup opened when a reflection card is tapped in
 * `ReflectionSection` while an activity is selected — owned by `TodayPage`
 * since it is the shared ancestor of the timeline (where the activity is
 * selected) and the reflection grid (where the card is tapped).
 *
 * Prefills the existing note when the card is ALREADY mapped to this
 * activity (re-clicking/re-dropping an already-mapped card reopens this to
 * edit or remove it, not to add a duplicate — `scheduled_activity_
 * reflections` has one row per (activity, card) pair). Save always upserts
 * that one pairing (`mapReflectionCard`); Remove is only offered when a
 * mapping already exists (`unmapReflectionCard`); closing without saving a
 * BRAND-NEW mapping leaves nothing behind.
 */
export function ReflectionMappingPopover({
  pending,
  activities,
  onSave,
  onRemove,
  onClose,
}: {
  pending: PendingReflectionMapping | null
  activities: ActivityList
  onSave: (note: string) => void
  onRemove: () => void
  onClose: () => void
}) {
  const [note, setNote] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const activity = pending ? activities.find((a) => a.id === pending.scheduledActivityId) ?? null : null
  const card = pending ? REFLECTION_CARDS.find((c) => c.number === pending.card) ?? null : null
  const existing = activity?.reflections.find((r) => r.card === pending?.card) ?? null
  const isOpen = pending !== null && activity !== null && card !== null

  // Re-seed the draft from the existing note every time a DIFFERENT pairing
  // opens — never mid-edit (there is no "outside" update to this once open).
  useEffect(() => {
    if (isOpen) setNote(existing?.note ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.scheduledActivityId, pending?.card, isOpen])

  useEffect(() => {
    if (isOpen) textareaRef.current?.focus()
  }, [isOpen])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSave(note)
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-black/45" />
      <Dialog.Content
        className="fixed inset-x-0 top-1/2 z-50 mx-auto flex w-[min(420px,92vw)] -translate-y-1/2 flex-col gap-md rounded-lg bg-surface p-lg shadow-elevation-2 focus:outline-none"
      >
        <div className="flex items-start justify-between gap-md">
          <div className="min-w-0">
            <Dialog.Title className="text-h1-sm font-semibold text-ink">{card?.title}</Dialog.Title>
            {activity && (
              <Dialog.Description className="mt-xs text-caption text-ink-dim">
                {activity.name}
                {activity.path.length ? ` ${activity.path.join(' ')}` : ''}
              </Dialog.Description>
            )}
          </div>
          <Dialog.Close asChild>
            <button
              type="button"
              aria-label="Close"
              className="flex size-[32px] shrink-0 items-center justify-center rounded-full text-ink-dim transition-colors hover:bg-bg hover:text-ink"
            >
              <X aria-hidden="true" className="size-[18px]" />
            </button>
          </Dialog.Close>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-md">
          <textarea
            ref={textareaRef}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Add a note"
            rows={4}
            className="w-full resize-y rounded-md border border-line bg-bg px-md py-sm text-note text-ink placeholder:text-ink-dim focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          />

          <div className="flex items-center justify-between gap-md">
            {existing ? (
              <Button type="button" variant="destructive" onClick={onRemove}>
                Remove
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  )
}
