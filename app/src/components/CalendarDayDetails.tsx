import { useEffect, useState, type FormEvent } from 'react'
import { Loader2, Pencil, Plus, Sparkles, Star, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fieldClass } from '@/components/ui/formField'
import type { ImportantDay } from '@/domain/importantDays'
import { localDateISO } from '@/lib/localTime'
import type { UseCalendarMarkersResult } from '@/state/useCalendarMarkers'
import { cn } from '@/lib/utils'

const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2024, i, 1).toLocaleDateString(undefined, { month: 'long' }))

/**
 * Under the calendar grid: the full names for the focused date (cells only
 * have room for a short version), plus adding, editing and deleting the
 * user's own important days. Everything here works by tap or keyboard.
 */
export function CalendarDayDetails({ date, calendar }: { date: Date; calendar: UseCalendarMarkersResult }) {
  const iso = localDateISO(date)
  const markers = calendar.markers.get(iso) ?? []
  const [editing, setEditing] = useState<null | { kind: 'add' } | { kind: 'edit'; day: ImportantDay }>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Moving to another date closes a half-done form.
  useEffect(() => {
    setEditing(null)
    setError(null)
  }, [iso])

  async function remove(id: string) {
    setBusyId(id)
    setError(null)
    const result = await calendar.removeImportantDay(id)
    setBusyId(null)
    if (!result.ok) setError(result.message)
  }

  const heading = date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="mt-sm flex flex-col gap-sm border-t border-line-soft pt-md">
      <div className="flex items-center justify-between gap-sm">
        <p className="text-body font-semibold text-ink">{heading}</p>
        {calendar.holidaysStatus === 'loading' && (
          <span className="flex items-center gap-xs text-nano text-ink-dim" role="status">
            <Loader2 aria-hidden="true" className="size-[12px] animate-spin" />
            Loading festivals…
          </span>
        )}
      </div>

      {calendar.holidaysStatus === 'error' && (
        <p role="alert" className="text-caption text-ink-dim">
          Couldn’t load festivals and holidays right now.
        </p>
      )}

      {markers.length === 0 ? (
        <p className="text-caption text-ink-dim">Nothing special on this day.</p>
      ) : (
        <ul className="flex flex-col gap-xs">
          {markers.map((marker, index) => {
            const own = marker.importantDayId
              ? calendar.importantDays.find((d) => d.id === marker.importantDayId)
              : undefined
            return (
              <li
                key={`${marker.kind}-${marker.name}-${index}`}
                className="flex min-h-[44px] items-center gap-sm rounded-sm bg-surface-2 py-xs pl-sm pr-xs"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'grid size-[28px] shrink-0 place-items-center rounded-full border border-line-soft bg-surface',
                    marker.kind === 'personal' ? 'text-ink' : 'text-ink-dim',
                  )}
                >
                  {marker.kind === 'personal' ? (
                    <Star className="size-[13px]" strokeWidth={1.8} />
                  ) : (
                    <Sparkles className="size-[13px]" strokeWidth={1.8} />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-px">
                  <span className={cn('break-words text-body text-ink', marker.kind === 'personal' ? 'font-semibold' : 'font-medium')}>
                    {marker.name}
                  </span>
                  <span className="text-caption-sm text-ink-dim">
                    {marker.kind === 'personal' ? 'Your day · repeats every year' : 'Festival / holiday'}
                  </span>
                </span>
                {own && calendar.canEditImportantDays && (
                  <span className="flex shrink-0 items-center">
                    <button
                      type="button"
                      aria-label={`Edit ${own.name}`}
                      onClick={() => setEditing({ kind: 'edit', day: own })}
                      className="flex size-stepper items-center justify-center rounded-full text-ink-dim transition-colors hover:bg-surface hover:text-ink"
                    >
                      <Pencil aria-hidden="true" className="size-[13px]" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${own.name}`}
                      disabled={busyId === own.id}
                      onClick={() => void remove(own.id)}
                      className="flex size-stepper items-center justify-center rounded-full text-ink-dim transition-colors hover:bg-surface hover:text-ink disabled:opacity-50"
                    >
                      {busyId === own.id ? (
                        <Loader2 aria-hidden="true" className="size-[13px] animate-spin" />
                      ) : (
                        <Trash2 aria-hidden="true" className="size-[13px]" />
                      )}
                    </button>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {error && (
        <p role="alert" className="text-caption font-semibold text-ink">
          {error}
        </p>
      )}

      {editing ? (
        <ImportantDayForm
          initial={
            editing.kind === 'edit'
              ? editing.day
              : { name: '', month: date.getMonth() + 1, day: date.getDate() }
          }
          submitLabel={editing.kind === 'edit' ? 'Save' : 'Add'}
          onCancel={() => setEditing(null)}
          onSubmit={async (value) => {
            const result =
              editing.kind === 'edit'
                ? await calendar.updateImportantDay({ ...value, id: editing.day.id })
                : await calendar.addImportantDay(value)
            if (result.ok) setEditing(null)
            return result
          }}
        />
      ) : calendar.canEditImportantDays ? (
        <Button
          type="button"
          variant="outline"
          size="inline"
          className="self-start gap-xs px-md"
          onClick={() => setEditing({ kind: 'add' })}
        >
          <Plus aria-hidden="true" className="size-[14px]" />
          Add important day
        </Button>
      ) : (
        <p className="text-caption text-ink-dim">Sign in to see festivals and holidays and to add your own important days.</p>
      )}
    </div>
  )
}

function ImportantDayForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: Omit<ImportantDay, 'id'>
  submitLabel: string
  onSubmit: (value: Omit<ImportantDay, 'id'>) => Promise<{ ok: true } | { ok: false; message: string }>
  onCancel: () => void
}) {
  const [name, setName] = useState(initial.name)
  const [month, setMonth] = useState(initial.month)
  const [day, setDay] = useState(initial.day)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const maxDay = new Date(2024, month, 0).getDate()

  async function handle(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    const result = await onSubmit({ name, month, day: Math.min(day, maxDay) })
    setSaving(false)
    if (!result.ok) setError(result.message)
  }

  return (
    <form onSubmit={handle} className="flex flex-col gap-sm rounded-md border border-line bg-bg p-sm">
      <input
        autoFocus
        className={fieldClass}
        placeholder="e.g. Mum’s birthday"
        aria-label="Name of the day"
        maxLength={80}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="flex gap-sm">
        <select
          aria-label="Month"
          className={cn(fieldClass, 'flex-1')}
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
        >
          {MONTHS.map((label, i) => (
            <option key={label} value={i + 1}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Day"
          className={cn(fieldClass, 'w-[88px]')}
          value={Math.min(day, maxDay)}
          onChange={(e) => setDay(Number(e.target.value))}
        >
          {Array.from({ length: maxDay }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </select>
      </div>
      <p className="text-nano text-ink-dim">Repeats every year.</p>
      {error && (
        <p role="alert" className="text-caption font-semibold text-ink">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-sm">
        <Button type="button" variant="ghost" size="inline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" size="inline" className="px-md" disabled={saving || name.trim() === ''}>
          {saving && <Loader2 aria-hidden="true" className="size-[14px] animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
