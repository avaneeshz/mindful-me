import { useState, type ReactNode } from 'react'
import { Pencil, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AddNameRow, RowIconButton } from '@/components/editor/ActivityRows'
import { InlineNameForm } from '@/components/editor/InlineNameForm'
import { validateNoteLabel } from '@/domain/activityNoteFields'

/**
 * One activity's own note fields: every entry has a note, and the activity
 * can title it and add a second one (e.g. "Gratitude"). A text note maps to
 * one of the two physical note columns, so there is room for two, no more.
 * `first`/`second` are the saved titles — `null` means "default title" /
 * "no second note".
 */
export function NoteFieldsPanel({
  activityName,
  first,
  second,
  onChange,
}: {
  activityName: string
  first: string | null
  second: string | null
  onChange: (first: string | null, second: string | null) => void
}) {
  const [editing, setEditing] = useState<'first' | 'second' | null>(null)
  const [error, setError] = useState<string | null>(null)

  function save(which: 'first' | 'second', title: string) {
    const problem = validateNoteLabel(title)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    setEditing(null)
    if (which === 'first') onChange(title, second)
    else onChange(first, title)
  }

  function row(which: 'first' | 'second', title: string, extra?: ReactNode) {
    if (editing === which) {
      return (
        <InlineNameForm
          initial={which === 'first' && first === null ? '' : title}
          error={error}
          onSave={(name) => save(which, name)}
          onCancel={() => {
            setEditing(null)
            setError(null)
          }}
        />
      )
    }
    return (
      <div className="flex items-center gap-xs rounded-md border border-line-soft bg-bg py-xs pl-md pr-xs">
        <span className="min-w-0 flex-1 truncate text-body text-ink">{title}</span>
        <RowIconButton label={`Rename ${title}`} onClick={() => setEditing(which)}>
          <Pencil aria-hidden="true" className="size-[14px]" />
        </RowIconButton>
        {extra}
      </div>
    )
  }

  return (
    <section aria-label="Note fields" className="flex flex-col gap-sm">
      <h4 className="text-caption font-bold uppercase tracking-tag text-ink-dim">Notes</h4>
      <p className="text-caption text-ink-dim">
        Each entry for &quot;{activityName}&quot; has a note. Give it a title, or add a second note field if you need one.
      </p>
      {row(
        'first',
        first ?? 'Notes',
        first !== null && (
          <Button variant="ghost" size="inline" onClick={() => onChange(null, second)}>
            Use default
          </Button>
        ),
      )}
      {second !== null ? (
        row(
          'second',
          second,
          <RowIconButton label={`Remove ${second}`} onClick={() => onChange(first, null)}>
            <X aria-hidden="true" className="size-[16px]" />
          </RowIconButton>,
        )
      ) : (
        <AddNameRow
          label="Second note title"
          placeholder="Add a second note, e.g. Gratitude"
          validate={validateNoteLabel}
          onAdd={(title) => onChange(first, title)}
        />
      )}
    </section>
  )
}
