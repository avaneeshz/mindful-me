import { useCallback, useState } from 'react'
import { noteTimeError, parseDateTimeLocalValue, toDateTimeLocalValue } from '@/domain/notes'

export interface UseNoteWhenResult {
  /** True once the user chose a time; false while the note will simply be stamped "now". */
  custom: boolean
  /** The `datetime-local` input value to show — the chosen time, or the current minute while on "now". */
  inputValue: string
  /** The newest time the picker allows (the current minute). */
  max: string
  /** Why the chosen time can't be used, or `null`. */
  error: string | null
  /** The chosen moment to hand to `addNote`, or `undefined` for "now" (and while the choice is invalid). */
  when: Date | undefined
  /** Starts a custom time from the picker, seeded with the current minute. */
  start: () => void
  setInputValue: (value: string) => void
  /** Back to "now". */
  reset: () => void
}

/**
 * The "when did this happen" choice shared by every note-writing surface: by
 * default the note is stamped with the current date and time, and the user may
 * pick another moment first. Pure UI state over `domain/notes`'s rules — each
 * surface renders its own field in its own design system.
 */
export function useNoteWhen(): UseNoteWhenResult {
  const [chosen, setChosen] = useState<string | null>(null)

  const start = useCallback(() => setChosen(toDateTimeLocalValue(new Date())), [])
  const reset = useCallback(() => setChosen(null), [])

  const now = new Date()
  const parsed = chosen === null ? null : parseDateTimeLocalValue(chosen)
  const error = chosen === null ? null : noteTimeError(parsed, now)

  return {
    custom: chosen !== null,
    inputValue: chosen ?? toDateTimeLocalValue(now),
    max: toDateTimeLocalValue(now),
    error,
    when: chosen !== null && !error && parsed ? parsed : undefined,
    start,
    setInputValue: setChosen,
    reset,
  }
}
