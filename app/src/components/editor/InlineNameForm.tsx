import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { fieldClass } from '@/components/ui/formField'
import { cn } from '@/lib/utils'

export function InlineNameForm({
  initial = '',
  error,
  onSave,
  onCancel,
}: {
  initial?: string
  /**
   * A validation error from the LAST submit attempt — found in code review:
   * a duplicate top-level name needs to keep this form open with the
   * rejected text still visible so the user can fix it in place, not close
   * it out from under them the way every other (always-succeeds, purely
   * local-first) save here does. `null`/omitted renders nothing.
   */
  error?: string | null
  onSave: (name: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial)
  return (
    <div className="flex flex-col gap-xs">
      <form
        className="flex items-center gap-sm"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim() === '') return
          onSave(name.trim())
        }}
      >
        <input autoFocus className={cn(fieldClass, 'py-xs')} value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" />
        <Button type="submit" size="inline" disabled={name.trim() === ''}>
          Save
        </Button>
        <Button type="button" variant="ghost" size="inline" onClick={onCancel}>
          Cancel
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-caption text-ink-dim">
          {error}
        </p>
      )}
    </div>
  )
}
