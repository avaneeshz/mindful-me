import { useEffect, useId, useState, type FormEvent } from 'react'
import { Moon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fieldClass } from '@/components/ui/formField'
import { DAY_OFF_REASON_MAX, normalizeDayOffReason, type DayOff } from '@/domain/dayOffs'
import { cn } from '@/lib/utils'

/**
 * The day-off section at the foot of the header's date picker: one switch
 * that marks the viewed day as a non-working day, then an optional typed
 * note for the reason. Presentational only; the header owns the data
 * through `useDayOffs`.
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
    <div className="mt-sm border-t border-line-soft pt-sm">
      <button
        type="button"
        role="switch"
        aria-checked={isOff}
        disabled={pending}
        onClick={isOff ? onClear : onMark}
        className="flex min-h-control w-full items-center gap-sm rounded-sm px-xs text-left text-ink transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60"
      >
        <span aria-hidden="true" className="grid size-[28px] shrink-0 place-items-center text-ink-dim">
          <Moon className="size-[15px]" strokeWidth={1.8} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-body font-medium">Day off</span>
          <span className="truncate text-caption-sm text-ink-dim">
            {isOff ? (dayOff?.reason ?? 'Add a note below (optional)') : `Mark ${dayLabel} as a non-working day`}
          </span>
        </span>
        <span
          aria-hidden="true"
          className={cn(
            'relative h-[20px] w-[34px] shrink-0 rounded-full transition-colors',
            isOff ? 'bg-inv-bg' : 'bg-line',
          )}
        >
          <span
            className={cn(
              'absolute left-[2px] top-[2px] size-[16px] rounded-full transition-transform motion-reduce:transition-none',
              isOff ? 'translate-x-[14px] bg-inv-ink' : 'bg-surface',
            )}
          />
        </span>
      </button>

      {isOff && (
        <form onSubmit={saveReason} className="mt-xs flex flex-col gap-sm px-xs pb-xs">
          <label htmlFor={reasonId} className="text-caption font-semibold text-ink-dim">
            Note <span className="font-normal">(optional)</span>
          </label>
          <input
            id={reasonId}
            type="text"
            value={reason}
            maxLength={DAY_OFF_REASON_MAX}
            placeholder="e.g. Travel, doctor’s visit…"
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
              Save note
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
