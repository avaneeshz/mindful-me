import { Beef, Check, ChevronDown, Footprints, Hash, ListChecks, NotebookPen, Timer, Trash2, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { formatDisplayValue, parseDisplayValue } from '@/domain/displayButtons'
import type { HeaderButtonConfig } from '@/domain/headerButtons'
import {
  canSubmitNote,
  formatEntryTypes,
  formatNoteTimestamp,
  noteButtonTypes,
  noteEntryWasEdited,
  partitionNoteEntriesByToday,
  toggleEntryType,
  type NoteEntry,
} from '@/domain/notes'
import { useDailyValue } from '@/state/useDailyValue'
import { useDisplayValueHistory } from '@/state/useDisplayValueHistory'
import { useNoteEntries } from '@/state/useNoteEntries'
import { useSupplementCompletions } from '@/state/useSupplementCompletions'
import { Button } from '@/lumen/components/ui/button'
import { ChoiceChips, IconBubble, ProgressRing } from '@/lumen/components/ui/primitives'
import { Sheet } from '@/lumen/components/ui/sheet'
import { LUMEN_DAY_END, LUMEN_DAY_START, minutesWithin } from '@/lumen/domain/lumenDay'
import { useStore } from '@/lumen/lib/store'
import { cn, formatDay, formatDuration } from '@/lumen/lib/utils'

/**
 * The person's own header buttons — the same list, order and data Classic's
 * header row shows, as Lumen chips: activity quick-logs (time logged today),
 * day values (Steps, Protein…), checklists (Supplements…) and notes.
 * Hidden buttons stay hidden; which ones exist is edited in Settings.
 */
export function HeaderButtonsRow() {
  const { headerButtons } = useStore()
  const buttons = headerButtons.visible
  if (buttons.length === 0) return null

  return (
    <>
      <div
        role="group"
        aria-label="Your day at a glance"
        // One calm row at every width, scrolling sideways; the fade hints there's more.
        className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-0.5 [mask-image:linear-gradient(90deg,#000_calc(100%-40px),transparent)] md:mx-0 md:px-0"
      >
        {buttons.map((button) =>
          button.category === 'activity' ? (
            <ActivityChip key={button.id} button={button} />
          ) : button.category === 'day_value' ? (
            <DayValueChip key={button.id} button={button} />
          ) : button.category === 'checklist' ? (
            <ChecklistChip key={button.id} button={button} />
          ) : (
            <NotesChip key={button.id} button={button} />
          ),
        )}
      </div>
    </>
  )
}

/* ——— The chip ——— */

function Chip({
  label,
  value,
  lead,
  onClick,
  complete,
  sheet,
}: {
  label: string
  value: string | null
  lead: React.ReactNode
  onClick: () => void
  complete?: boolean
  sheet?: React.ReactNode
}) {
  return (
    <>
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}${value ? `, ${value}` : ''}`}
      className={cn(
        'flex h-12 shrink-0 items-center gap-2.5 rounded-full border pl-1.5 pr-4 text-sm transition-colors duration-150 active:scale-[0.98]',
        complete
          ? 'border-mint/30 bg-mint/[0.06] hover:bg-mint/[0.1]'
          : 'border-line/[0.09] bg-surface-1/70 hover:border-line/[0.14] hover:bg-surface-2',
      )}
    >
      {lead}
      <span className="whitespace-nowrap text-ink-muted">{label}</span>
      <span className="whitespace-nowrap tabular text-ink">{value ?? '—'}</span>
    </button>
    {sheet}
    </>
  )
}

function iconForValue(button: HeaderButtonConfig): LucideIcon {
  const key = (button.key ?? button.label).toLowerCase()
  if (key.includes('step')) return Footprints
  if (key.includes('protein')) return Beef
  if (button.dayValueUnit === 'min') return Timer
  return Hash
}

function ActivityChip({ button }: { button: HeaderButtonConfig }) {
  const { axis, allTiles, openLog, nextFreeFrom, selectedSlot } = useStore()
  const name = button.activityName
  const tile = name ? allTiles.find((t) => t.cards.some((c) => c.name === name)) : undefined
  const minutes = useMemo(
    () =>
      axis
        .filter((item) => item.activity.name === name)
        .reduce((sum, item) => sum + minutesWithin(item, LUMEN_DAY_START, LUMEN_DAY_END), 0),
    [axis, name],
  )
  return (
    <Chip
      label={button.label}
      value={minutes > 0 ? formatDuration(minutes) : null}
      lead={tile ? <IconBubble icon={tile.icon} color={tile.color.id} size="sm" className="h-9 w-9" /> : <IconBubble icon={Timer} hue="accent" size="sm" className="h-9 w-9" />}
      onClick={() => name && openLog({ kind: 'new', tileId: null, cardName: name, start: nextFreeFrom(selectedSlot) })}
    />
  )
}

// Each chip owns the ONE instance of its data hook and hands it to its own
// sheet, so a save in the sheet shows on the chip immediately.

function DayValueChip({ button }: { button: HeaderButtonConfig }) {
  const { day } = useStore()
  const [open, setOpen] = useState(false)
  const daily = useDailyValue(button.key ?? button.id, button.id, day, true)
  const value = daily.value
  const target = button.dayValueUnit === 'target' ? button.dayValueTarget : null
  const Icon = iconForValue(button)
  const progress = target ? (value ?? 0) / target : null
  return (
    <Chip
      label={button.label}
      value={value === null && !target ? null : formatDisplayValue(button.id, value)}
      complete={progress !== null && progress >= 1}
      lead={
        progress !== null ? (
          <ProgressRing value={progress} size={36} complete={progress >= 1}>
            {progress >= 1 ? <Check className="h-4 w-4 text-mint" /> : <Icon className="h-4 w-4 text-sky" strokeWidth={1.8} />}
          </ProgressRing>
        ) : (
          <IconBubble icon={Icon} hue="sky" size="sm" className="h-9 w-9" />
        )
      }
      onClick={() => setOpen(true)}
      sheet={<DayValueSheet button={button} open={open} daily={daily} onClose={() => setOpen(false)} />}
    />
  )
}

function ChecklistChip({ button }: { button: HeaderButtonConfig }) {
  const { day } = useStore()
  const [open, setOpen] = useState(false)
  const completions = useSupplementCompletions(button.id, button.checklistItems, day, open)
  const { checklist } = completions
  const done = checklist.filter((e) => e.done).length
  const total = button.checklistItems.length
  const progress = total > 0 ? done / total : 0
  return (
    <Chip
      label={button.label}
      value={`${done}/${total}`}
      complete={total > 0 && done === total}
      lead={
        <ProgressRing value={progress} size={36} complete={total > 0 && done === total}>
          {total > 0 && done === total ? <Check className="h-4 w-4 text-mint" /> : <ListChecks className="h-4 w-4 text-accent-ink" strokeWidth={1.8} />}
        </ProgressRing>
      }
      onClick={() => setOpen(true)}
      sheet={<ChecklistSheet button={button} open={open} completions={completions} onClose={() => setOpen(false)} />}
    />
  )
}

function NotesChip({ button }: { button: HeaderButtonConfig }) {
  const { now } = useStore()
  const [open, setOpen] = useState(false)
  const notes = useNoteEntries(button.key ?? button.id, open)
  const today = partitionNoteEntriesByToday(notes.entries, now).recent.length
  return (
    <Chip
      label={button.label}
      value={today > 0 ? String(today) : null}
      lead={<IconBubble icon={NotebookPen} hue="accent" size="sm" className="h-9 w-9" />}
      onClick={() => setOpen(true)}
      sheet={<NotesSheet button={button} open={open} notes={notes} onClose={() => setOpen(false)} />}
    />
  )
}

/* ——— Day value: set the day's number; see and correct past days ——— */

function DayValueSheet({
  button,
  open,
  daily,
  onClose,
}: {
  button: HeaderButtonConfig
  open: boolean
  daily: ReturnType<typeof useDailyValue>
  onClose: () => void
}) {
  const { day } = useStore()
  const history = useDisplayValueHistory(button.id, button.key ?? button.id, true, open)
  const [draft, setDraft] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [editing, setEditing] = useState<{ date: string; draft: string } | null>(null)

  useEffect(() => {
    if (!open) return
    setDraft(daily.value === null ? '' : String(daily.value))
    setShowHistory(false)
    setEditing(null)
    // Seed from the day's value each time the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const target = button.dayValueUnit === 'target' ? button.dayValueTarget : null
  const parsed = parseDisplayValue(draft)
  const unitHint = button.dayValueUnit === 'min' ? 'minutes' : target ? `of ${target}` : null
  const past = history.entries.filter((e) => e.date !== day)

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={button.label}
      description={formatDay(day, 'long')}
      leading={<IconBubble icon={iconForValue(button)} hue="sky" />}
      footer={
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          disabled={draft.trim() !== '' && parsed === null}
          onClick={() => {
            daily.setValue(parsed)
            onClose()
          }}
        >
          Save
        </Button>
      }
    >
      <label className="flex flex-col gap-2">
        <span className="text-xs font-medium text-ink-muted">Value{unitHint ? ` (${unitHint})` : ''}</span>
        <input
          type="text"
          inputMode="numeric"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="0"
          className="h-16 rounded-tile border border-line/[0.09] bg-surface-2/60 px-4 text-3xl font-medium tabular text-ink placeholder:text-ink-faint focus-visible:border-accent-ink/60"
        />
        {draft.trim() !== '' && parsed === null && <span className="text-sm text-danger">Enter a whole number</span>}
        {target && parsed !== null && (
          <span className="text-sm text-ink-muted">{parsed >= target ? 'Goal reached' : `${target - parsed} to go`}</span>
        )}
      </label>

      <button
        type="button"
        aria-expanded={showHistory}
        onClick={() => setShowHistory((s) => !s)}
        className="-mx-2 mt-6 flex min-h-11 w-[calc(100%+16px)] items-center justify-between rounded-control px-2 text-sm font-medium text-ink-muted transition-colors hover:bg-white/[0.03] hover:text-ink"
      >
        Earlier days
        <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', showHistory && 'rotate-180')} />
      </button>
      {showHistory && (
        <ul className="mt-1 divide-y divide-line/[0.06]">
          {history.status === 'loading' && past.length === 0 && <li className="py-4 text-sm text-ink-faint">Loading…</li>}
          {history.status !== 'loading' && past.length === 0 && <li className="py-4 text-sm text-ink-faint">No earlier values yet.</li>}
          {past.map((entry) =>
            editing?.date === entry.date ? (
              <li key={entry.date} className="flex items-center gap-2 py-2">
                <span className="flex-1 text-sm text-ink">{formatDay(entry.date)}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label={`Value for ${formatDay(entry.date, 'long')}`}
                  value={editing.draft}
                  onChange={(e) => setEditing({ date: entry.date, draft: e.target.value })}
                  className="h-10 w-24 rounded-control border border-line/[0.09] bg-surface-2/60 px-3 text-right tabular text-ink focus-visible:border-accent-ink/60"
                />
                <Button
                  variant="primary"
                  className="h-10"
                  disabled={parseDisplayValue(editing.draft) === null || history.pendingDate === entry.date}
                  onClick={() => {
                    const next = parseDisplayValue(editing.draft)
                    if (next === null) return
                    void history.updateEntry(entry.date, next).then(() => setEditing(null))
                  }}
                >
                  Save
                </Button>
              </li>
            ) : (
              <li key={entry.date}>
                <button
                  type="button"
                  onClick={() => setEditing({ date: entry.date, draft: String(entry.value) })}
                  className="flex min-h-12 w-full items-center justify-between gap-3 text-left text-sm transition-colors hover:text-ink"
                >
                  <span className="text-ink-muted">{formatDay(entry.date)}</span>
                  <span className="tabular text-ink">{formatDisplayValue(button.id, entry.value)}</span>
                </button>
              </li>
            ),
          )}
        </ul>
      )}
    </Sheet>
  )
}

/* ——— Checklist: tick items, with an optional note each; resets daily ——— */

function ChecklistSheet({
  button,
  open,
  completions,
  onClose,
}: {
  button: HeaderButtonConfig
  open: boolean
  completions: ReturnType<typeof useSupplementCompletions>
  onClose: () => void
}) {
  const { day } = useStore()
  const items = button.checklistItems
  const { checklist, status, error, setCompletion } = completions
  const [noteOpen, setNoteOpen] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setNoteOpen(null)
    setDrafts({})
  }, [open])

  const done = checklist.filter((e) => e.done).length
  const labelOf = (key: string) => items.find((i) => i.key === key)?.label ?? key

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={button.label}
      description={`${formatDay(day, 'long')} · ${done} of ${items.length} done`}
      leading={<IconBubble icon={ListChecks} hue="accent" />}
    >
      {error && <p className="mb-3 text-sm text-ink-faint">{error}</p>}
      {items.length === 0 && <p className="py-6 text-center text-sm text-ink-muted">This checklist has no items yet. Add some in Settings.</p>}
      <ul className="flex flex-col gap-1.5" aria-busy={status === 'loading'}>
        {checklist.map((entry) => {
          const draft = drafts[entry.itemKey] ?? entry.note
          const showNote = noteOpen === entry.itemKey || entry.note !== ''
          return (
            <li key={entry.itemKey} className="rounded-control border border-line/[0.07] bg-white/[0.02]">
              <div className="flex items-center">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={entry.done}
                  onClick={() => void setCompletion(entry.itemKey, !entry.done, draft)}
                  className="flex min-h-14 flex-1 items-center gap-3 px-3 text-left"
                >
                  <span
                    className={cn(
                      'grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-colors',
                      entry.done ? 'border-mint bg-mint text-canvas' : 'border-line/25',
                    )}
                  >
                    {entry.done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  </span>
                  <span className={cn('text-[15px]', entry.done ? 'text-ink-muted' : 'text-ink')}>{labelOf(entry.itemKey)}</span>
                </button>
                <button
                  type="button"
                  aria-expanded={showNote}
                  aria-label={`${entry.note ? 'Edit' : 'Add'} note for ${labelOf(entry.itemKey)}`}
                  onClick={() => setNoteOpen(noteOpen === entry.itemKey ? null : entry.itemKey)}
                  className="mr-1 grid h-11 w-11 place-items-center rounded-full text-ink-faint transition-colors hover:bg-white/[0.05] hover:text-ink"
                >
                  <NotebookPen className="h-4 w-4" />
                </button>
              </div>
              {showNote && (
                <div className="px-3 pb-3">
                  <textarea
                    rows={2}
                    value={draft}
                    placeholder="Add a note"
                    aria-label={`Note for ${labelOf(entry.itemKey)}`}
                    onChange={(e) => setDrafts((d) => ({ ...d, [entry.itemKey]: e.target.value }))}
                    onBlur={() => draft !== entry.note && void setCompletion(entry.itemKey, entry.done, draft)}
                    className="w-full resize-y rounded-control border border-line/[0.09] bg-surface-1 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus-visible:border-accent-ink/60"
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}

/* ——— Notes: write one, with a type where the button has types; see and edit the history ——— */

function NotesSheet({
  button,
  open,
  notes,
  onClose,
}: {
  button: HeaderButtonConfig
  open: boolean
  notes: ReturnType<typeof useNoteEntries>
  onClose: () => void
}) {
  const { now } = useStore()
  const key = button.key ?? button.id
  const types = noteButtonTypes(key)
  const [text, setText] = useState('')
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [editing, setEditing] = useState<{ id: string; text: string; types: string[] } | null>(null)
  const [showEarlier, setShowEarlier] = useState(false)

  useEffect(() => {
    if (!open) return
    setText('')
    setSelectedTypes([])
    setEditing(null)
    setShowEarlier(false)
  }, [open])

  const { recent, earlier } = partitionNoteEntriesByToday(notes.entries, now)
  const canStore = canSubmitNote(key, text, selectedTypes)

  const row = (entry: NoteEntry) =>
    editing?.id === entry.id ? (
      <li key={entry.id} className="flex flex-col gap-2 rounded-tile border border-line/[0.09] bg-surface-2/40 p-3">
        {types && (
          <ChoiceChips label="Type" options={types} selected={editing.types} onToggle={(t) => t && setEditing({ ...editing, types: toggleEntryType(editing.types, t) })} />
        )}
        <textarea
          rows={3}
          value={editing.text}
          aria-label="Edit note"
          onChange={(e) => setEditing({ ...editing, text: e.target.value })}
          className="resize-y rounded-control border border-line/[0.09] bg-surface-1 px-3 py-2.5 text-[15px] text-ink focus-visible:border-accent-ink/60"
        />
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete note"
            disabled={notes.pendingEntryId === entry.id}
            onClick={() => void notes.deleteNote(entry.id).then((ok) => ok && setEditing(null))}
          >
            <Trash2 className="h-[18px] w-[18px]" />
          </Button>
          <Button variant="ghost" className="ml-auto h-10" onClick={() => setEditing(null)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="h-10"
            disabled={!canSubmitNote(key, editing.text, editing.types) || notes.pendingEntryId === entry.id}
            onClick={() => void notes.updateNote(entry.id, editing.text.trim(), editing.types).then((ok) => ok && setEditing(null))}
          >
            Save
          </Button>
        </div>
      </li>
    ) : (
      <li key={entry.id}>
        <button
          type="button"
          onClick={() => setEditing({ id: entry.id, text: entry.note, types: [...entry.entryTypes] })}
          className="flex w-full flex-col gap-1 rounded-control px-2 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
        >
          <span className="flex items-center gap-2 text-xs text-ink-faint">
            {formatNoteTimestamp(new Date(entry.createdAt))}
            {noteEntryWasEdited(entry) && <span>· edited</span>}
            {entry.entryTypes.length > 0 && (
              <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-ink-muted">{formatEntryTypes(entry.entryTypes)}</span>
            )}
          </span>
          <span className="whitespace-pre-wrap text-sm text-ink">{entry.note}</span>
        </button>
      </li>
    )

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={button.label}
      description="Notes are kept with the time you write them."
      leading={<IconBubble icon={NotebookPen} hue="accent" />}
    >
      <div className="flex flex-col gap-3">
        {types && (
          <ChoiceChips label="Type" options={types} selected={selectedTypes} onToggle={(t) => t && setSelectedTypes((s) => toggleEntryType(s, t))} />
        )}
        <textarea
          rows={3}
          value={text}
          placeholder="Write it down…"
          aria-label={`New ${button.label} note`}
          onChange={(e) => setText(e.target.value)}
          className="resize-y rounded-control border border-line/[0.09] bg-surface-2/60 px-3.5 py-3 text-[15px] text-ink placeholder:text-ink-faint focus-visible:border-accent-ink/60"
        />
        <Button
          variant="primary"
          className="self-end"
          disabled={!canStore || notes.submitting}
          onClick={() =>
            void notes.addNote(text.trim(), selectedTypes).then((ok) => {
              if (ok) {
                setText('')
                setSelectedTypes([])
              }
            })
          }
        >
          Store
        </Button>
        {notes.error && <p className="text-sm text-ink-faint">{notes.error}</p>}
      </div>

      <p className="mb-1 mt-6 text-xs font-medium text-ink-muted">Today</p>
      <ul className="flex flex-col gap-0.5">
        {recent.length === 0 && <li className="px-2 py-2 text-sm text-ink-faint">Nothing yet today.</li>}
        {recent.map(row)}
      </ul>

      <button
        type="button"
        aria-expanded={showEarlier}
        onClick={() => setShowEarlier((s) => !s)}
        className="-mx-2 mt-4 flex min-h-11 w-[calc(100%+16px)] items-center justify-between rounded-control px-2 text-sm font-medium text-ink-muted transition-colors hover:bg-white/[0.03] hover:text-ink"
      >
        Earlier
        <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', showEarlier && 'rotate-180')} />
      </button>
      {showEarlier && (
        <ul className="flex flex-col gap-0.5">
          {notes.status === 'loading' && earlier.length === 0 && <li className="px-2 py-2 text-sm text-ink-faint">Loading…</li>}
          {notes.status !== 'loading' && earlier.length === 0 && <li className="px-2 py-2 text-sm text-ink-faint">No earlier notes.</li>}
          {earlier.map(row)}
        </ul>
      )}
    </Sheet>
  )
}
