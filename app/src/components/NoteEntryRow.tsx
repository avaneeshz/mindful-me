import { useId, useState, type FormEvent } from 'react'
import { Loader2, Pencil, X } from 'lucide-react'
import { Chip } from '@/components/ui/chip'
import { Button } from '@/components/ui/button'
import { fieldClass } from '@/components/ui/formField'
import {
  canSubmitNote,
  formatEntryTypes,
  formatNoteTimestamp,
  noteEntryWasEdited,
  toggleEntryType,
  type NoteEntry,
} from '@/domain/notes'
import { cn } from '@/lib/utils'

/**
 * One stored note in a history list: its timestamp, types and text, with
 * Edit (in place) and Remove. Shared by every surface that lists note
 * entries — the header note pills and the State Tile notes window — so a
 * note looks and behaves the same wherever it is shown. Owns only its own
 * edit-form state; saving and removing go through the caller's
 * `useNoteEntries` handlers.
 */
export function NoteEntryRow({
  entry,
  label,
  types,
  pendingEntryId,
  onUpdate,
  onDelete,
}: {
  entry: NoteEntry
  /** Names the note to assistive tech ("Edit this {label} note"). */
  label: string
  /** The button's type vocabulary, or `null` when it has no type selector. */
  types: readonly string[] | null
  pendingEntryId: string | null
  onUpdate: (id: string, note: string, entryTypes: readonly string[]) => Promise<boolean>
  onDelete: (id: string) => Promise<boolean>
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [entryTypes, setEntryTypes] = useState<string[]>([])
  const textareaId = useId()
  const busy = pendingEntryId === entry.id
  const canSubmit = canSubmitNote(entry.buttonKey, text, entryTypes)

  function startEdit() {
    setText(entry.note)
    setEntryTypes([...entry.entryTypes])
    setEditing(true)
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (pendingEntryId !== null || !canSubmit) return
    if (await onUpdate(entry.id, text, entryTypes)) setEditing(false)
  }

  if (editing) {
    return (
      <li className="rounded-sm bg-bg px-sm py-xs">
        <form onSubmit={save} className="flex flex-col gap-sm">
          {types && (
            <fieldset className="flex flex-col gap-sm">
              <legend className="sr-only">Type (choose one or more)</legend>
              <div role="group" aria-label="Type" className="flex flex-wrap gap-xs">
                {types.map((type) => {
                  const isSelected = entryTypes.includes(type)
                  return (
                    <Chip
                      key={type}
                      as="button"
                      size="xs"
                      tone={isSelected ? 'active' : 'surface'}
                      interactive
                      aria-pressed={isSelected}
                      onClick={() => setEntryTypes((selected) => toggleEntryType(selected, type))}
                    >
                      {type}
                    </Chip>
                  )
                })}
              </div>
            </fieldset>
          )}
          <label htmlFor={textareaId} className="sr-only">
            Edit note
          </label>
          <textarea
            id={textareaId}
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={3}
            autoFocus
            disabled={busy}
            className={cn(fieldClass, 'resize-none text-caption font-semibold disabled:opacity-60')}
          />
          <div className="flex items-center gap-md">
            <Button type="submit" variant="accent" size="inline" disabled={busy || !canSubmit}>
              {busy ? (
                <>
                  <Loader2 aria-hidden="true" className="size-[13px] animate-spin" />
                  Saving…
                </>
              ) : (
                'Save'
              )}
            </Button>
            <Button type="button" variant="ghost" size="inline" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </form>
      </li>
    )
  }

  return (
    <li className="rounded-sm bg-bg px-sm py-xs">
      <div className="flex items-center justify-between gap-sm">
        <time dateTime={entry.createdAt} className="text-nano font-semibold text-ink-dim">
          {formatNoteTimestamp(new Date(entry.createdAt))}
          {noteEntryWasEdited(entry) && ' · edited'}
        </time>
        {entry.entryTypes.length > 0 && (
          <span className="text-right text-nano font-semibold text-ink-dim">{formatEntryTypes(entry.entryTypes)}</span>
        )}
      </div>
      <p className="mt-xs whitespace-pre-wrap break-words text-caption text-ink">{entry.note}</p>
      <div className="mt-xs flex items-center gap-lg">
        <Button
          variant="accent"
          size="inline"
          onClick={startEdit}
          disabled={pendingEntryId !== null}
          aria-label={`Edit this ${label} note`}
        >
          <Pencil aria-hidden="true" className="size-[12px]" />
          Edit
        </Button>
        <Button
          variant="destructive"
          size="inline"
          onClick={() => void onDelete(entry.id)}
          disabled={pendingEntryId !== null}
          aria-label={`Remove this ${label} note`}
        >
          <X aria-hidden="true" className="size-[12px]" />
          {busy ? 'Removing…' : 'Remove'}
        </Button>
      </div>
    </li>
  )
}
