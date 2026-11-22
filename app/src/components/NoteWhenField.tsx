import { useId } from 'react'
import { CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fieldClass } from '@/components/ui/formField'
import { formatNoteTimestamp } from '@/domain/notes'
import type { UseNoteWhenResult } from '@/state/useNoteWhen'
import { cn } from '@/lib/utils'

/**
 * "When did this happen" for a note form: reads "Now · <time>" with a Change
 * control until the user picks a moment, then shows a date-and-time field with
 * a way back to now. State lives in `useNoteWhen`.
 */
export function NoteWhenField({ when, disabled = false }: { when: UseNoteWhenResult; disabled?: boolean }) {
  const id = useId()

  if (!when.custom) {
    return (
      <button
        type="button"
        onClick={when.start}
        disabled={disabled}
        className="flex items-center justify-between gap-sm rounded-md py-xs text-caption text-ink-dim transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60"
      >
        <span className="flex items-center gap-xs">
          <CalendarClock aria-hidden="true" className="size-[14px]" />
          Now · {formatNoteTimestamp(new Date())}
        </span>
        <span className="font-semibold text-ink">Change</span>
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-xs">
      <label htmlFor={id} className="text-caption font-semibold text-ink-dim">
        When
      </label>
      <div className="flex items-center gap-sm">
        <input
          id={id}
          type="datetime-local"
          aria-invalid={when.error !== null}
          value={when.inputValue}
          max={when.max}
          disabled={disabled}
          onChange={(event) => when.setInputValue(event.target.value)}
          className={cn(fieldClass, 'min-w-0 flex-1 tabular-nums disabled:opacity-60')}
        />
        <Button type="button" variant="ghost" onClick={when.reset} disabled={disabled}>
          Use now
        </Button>
      </div>
      {when.error && (
        <p role="alert" className="text-caption font-semibold text-ink-dim">
          {when.error}
        </p>
      )}
    </div>
  )
}
