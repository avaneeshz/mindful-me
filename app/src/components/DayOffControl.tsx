import { useEffect, useId, useState, type FormEvent } from 'react'
import { Check, Moon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Chip, chipVariants } from '@/components/ui/chip'
import { fieldClass } from '@/components/ui/formField'
import { DAY_OFF_REASON_MAX, DAY_OFF_REASON_SUGGESTIONS, normalizeDayOffReason, type DayOff } from '@/domain/dayOffs'
import { cn } from '@/lib/utils'

/**
 * The day-off section at the foot of the header's date picker: one toggle
 * that marks the viewed day as a non-working day, then an optional reason —
 * typed and saved, or one tap on a suggestion (which saves straight away). Presentational only; the
 * header owns the data through `useDayOffs`.
 */
export function DayOffControl({
  dayLabel,
  dayOff,
  pending,
  error,
  onMark,
  onClear,
  onSaveReason,
}: {
  /** "today" or e.g. "Mon, 5 Oct" — names the day in the toggle. */
  dayLabel: string
  dayOff: DayOff | null
  pending: boolean
  error: string | null
  onMark: () => void
  onClear: () => void
  onSaveReason: (reason: string | null) => void
}) {
  const reasonId = useId()
  const [reason, setReason] = useState(dayOff?.reason ?? '')
  const [justSaved, setJustSaved] = useState(false)

  // A different day, or the server's copy arriving, resets the draft.
  useEffect(() => {
    setReason(dayOff?.reason ?? '')
    setJustSaved(false)
  }, [dayOff?.localDate, dayOff?.reason])

  const isOff = dayOff !== null
  const reasonChanged = normalizeDayOffReason(reason) !== (dayOff?.reason ?? null)

  function saveReason(event?: FormEvent) {
    event?.preventDefault()
    if (pending || !reasonChanged) return
    onSaveReason(normalizeDayOffReason(reason))
    setJustSaved(true)
  }

  return (
    <div className="mt-md border-t border-line pt-md">
      <button
        type="button"
        role="switch"
        aria-checked={isOff}
        disabled={pending}
        onClick={isOff ? onClear : onMark}
        className={cn(
          chipVariants({ tone: isOff ? 'active' : 'surface', size: 'sm', interactive: true }),
          'w-full justify-between disabled:opacity-60',
        )}
      >
        <span className="flex items-center gap-sm">
          <Moon aria-hidden="true" className="size-[14px]" />
          {isOff ? 'Day off' : `Mark ${dayLabel} as a day off`}
        </span>
        {isOff && <Check aria-hidden="true" className="size-[14px]" />}
      </button>

      {isOff && (
        <form onSubmit={saveReason} className="mt-sm flex flex-col gap-sm">
          <label htmlFor={reasonId} className="text-caption font-semibold text-ink-dim">
            Why? <span className="font-normal">(optional)</span>
          </label>
          <div className="flex flex-wrap gap-xs">
            {DAY_OFF_REASON_SUGGESTIONS.map((suggestion) => (
              <Chip
                key={suggestion}
                as="button"
                size="xs"
                tone={reason.trim() === suggestion ? 'active' : 'surface'}
                interactive
                aria-pressed={reason.trim() === suggestion}
                onClick={() => {
                  setReason(suggestion)
                  if (pending || normalizeDayOffReason(suggestion) === (dayOff?.reason ?? null)) return
                  onSaveReason(suggestion)
                  setJustSaved(true)
                }}
              >
                {suggestion}
              </Chip>
            ))}
          </div>
          <input
            id={reasonId}
            type="text"
            value={reason}
            maxLength={DAY_OFF_REASON_MAX}
            placeholder="e.g. Diwali, doctor’s visit…"
            onChange={(event) => {
              setReason(event.target.value)
              setJustSaved(false)
            }}
            className={cn(fieldClass, 'text-caption')}
          />
          <div className="flex items-center gap-sm">
            <Button
              type="submit"
              variant="outline"
              className="h-[36px] px-md text-caption"
              disabled={pending || !reasonChanged}
            >
              Save reason
            </Button>
            {justSaved && !reasonChanged && (
              <span role="status" className="text-caption font-semibold text-ink-dim">
                Saved.
              </span>
            )}
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-sm text-caption text-ink-dim">
          {error}
        </p>
      )}
    </div>
  )
}
