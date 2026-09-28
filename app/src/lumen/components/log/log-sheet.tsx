import { AnimatePresence, motion } from 'motion/react'
import { Check, ChevronDown, ChevronLeft, ChevronRight, CircleCheck, Circle, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { FLAGS, QUALITIES, SYMPTOMS } from '@/data/activities'
import { displayButtonForActivityName, songCountToMinutes, WORSHIP_MINUTES_PER_SONG } from '@/domain/displayButtons'
import { maxContiguousDuration } from '@/domain/scheduling'
import type { ActivityCard, FieldSelections } from '@/domain/types'
import { useCatalogActivityId } from '@/state/useCatalogActivityId'
import { useEffectiveParameterOptions } from '@/state/useEffectiveParameterOptions'
import { Button } from '@/lumen/components/ui/button'
import { ChoiceChips, IconBubble } from '@/lumen/components/ui/primitives'
import { Sheet } from '@/lumen/components/ui/sheet'
import type { LumenTile } from '@/lumen/data/catalog'
import {
  axisClock,
  axisFromClock,
  durationToClock,
  isInLumenDay,
  LUMEN_AXIS_BOUNDS,
  LUMEN_DAY_START,
  schedulingList,
} from '@/lumen/domain/lumenDay'
import { useStore } from '@/lumen/lib/store'
import { addDays, cn, formatDuration, weekdayShort } from '@/lumen/lib/utils'
import { ReflectionsSection } from './reflections'

/**
 * What the sheet is for: a new entry (optionally from a tile, or straight to
 * one activity — a header button's quick log — at a start on the axis), or
 * editing one.
 */
export type LogTarget =
  | { kind: 'new'; tileId: string | null; start: number; cardName?: string }
  | { kind: 'edit'; id: string }

const QUICK_DURATIONS = [15, 30, 45, 60, 120]
const DEFAULT_DURATION = 30

type Draft = {
  tileId: string | null
  cardName: string | null
  path: string[]
  start: number
  duration: number
  quality: string[]
  symptoms: string[]
  flag: string | null
  notes: string
  dreamsNote: string
  fieldSelections: FieldSelections
}

const emptyDetails = { quality: [], symptoms: [], flag: null, notes: '', dreamsNote: '', fieldSelections: {} }

/** The node a drill-down path leads to inside a card (the card itself for an empty path). */
function nodeAt(card: ActivityCard | undefined, path: readonly string[]): ActivityCard | undefined {
  let node = card
  for (const step of path) node = node?.children?.find((child) => child.name === step)
  return node
}

const clockOf = (hhmm: string): number | null => {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm)
  if (!match) return null
  const minutes = Number(match[1]) * 60 + Number(match[2])
  return minutes < 1440 ? minutes : null
}

/**
 * Log or edit one activity — Lumen's own version of Classic's log modal,
 * with everything that modal carries: the full drill-down to a leaf, any
 * start and any duration (including across midnight), activity quality,
 * chronic symptoms, protective response, notes, the activity's configured
 * note fields, completion and reflection cards. The option lists are the
 * person's own (PICKER-CUSTOM-1), resolved exactly as Classic resolves them.
 *
 * Quick path stays two taps: tile → activity → Log. Details are one tap
 * further, folded away until wanted.
 */
export function LogSheet({ target, onClose }: { target: LogTarget | null; onClose: () => void }) {
  const { tiles, allTiles, axis, tileOf, logActivity, updateActivity, removeActivity, data, day, setDay, isCardDone, toggleCardDone } = useStore()
  const open = target !== null
  const editing = target?.kind === 'edit' ? axis.find((item) => item.activity.id === target.id) ?? null : null
  const [draft, setDraft] = useState<Draft | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // A fresh draft each time the sheet opens.
  useEffect(() => {
    if (!target) {
      setDraft(null)
      return
    }
    setSubmitting(false)
    if (target.kind === 'new') {
      // Straight to one activity (a header button): find the tile it lives in.
      const home = target.cardName ? allTiles.find((t) => t.cards.some((c) => c.name === target.cardName)) : undefined
      const room = maxContiguousDuration(schedulingList(axis), target.start, null, LUMEN_AXIS_BOUNDS)
      setDraft({
        tileId: home?.id ?? target.tileId,
        cardName: home ? target.cardName! : null,
        path: [],
        start: target.start,
        duration: Math.max(1, Math.min(DEFAULT_DURATION, room || DEFAULT_DURATION)),
        ...emptyDetails,
      })
      setShowDetails(false)
      return
    }
    const item = axis.find((i) => i.activity.id === target.id)
    if (!item) return
    const a = item.activity
    setDraft({
      tileId: tileOf(a)?.id ?? null,
      cardName: a.name,
      path: a.path,
      start: item.start,
      duration: a.durationMinutes,
      quality: a.quality,
      symptoms: a.symptoms,
      flag: a.flags[0] ?? null,
      notes: a.notes ?? '',
      dreamsNote: a.dreamsNote ?? '',
      fieldSelections: a.fieldSelections,
    })
    setShowDetails(
      a.quality.length + a.symptoms.length + a.flags.length > 0 ||
        Boolean(a.notes || a.dreamsNote) ||
        Object.values(a.fieldSelections).some((v) => v.length > 0),
    )
    // Only when the sheet opens (or retargets) — not on every data change underneath it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  // The entry being edited vanished (removed elsewhere, then synced in): nothing left to edit.
  const editVanished = target?.kind === 'edit' && editing === null
  useEffect(() => {
    if (editVanished) onClose()
  }, [editVanished, onClose])

  const tile: LumenTile | undefined = allTiles.find((t) => t.id === draft?.tileId)
  const card = tile?.cards.find((c) => c.name === draft?.cardName)
  const node = nodeAt(card, draft?.path ?? [])
  const atLeaf = Boolean(draft?.cardName) && (editing !== null || (node !== undefined && !node.children?.length))
  // Editing always shows the entry itself — even one whose activity has
  // since been renamed or deleted from the catalog (it keeps its own name).
  const step: 'tile' | 'activity' | 'details' =
    draft && editing ? 'details' : !draft || !tile ? 'tile' : !atLeaf ? 'activity' : 'details'

  // The person's own option lists for this activity; the built-in defaults until they load.
  const catalogId = useCatalogActivityId(draft?.cardName ?? null)
  const parameterOptions = useEffectiveParameterOptions(catalogId)
  const ready = parameterOptions.status === 'ready'
  const qualityOptions = ready ? parameterOptions.effective.quality.map((o) => o.label) : QUALITIES.map((q) => q.id)
  const symptomOptions = ready ? parameterOptions.effective.symptom.map((o) => o.label) : SYMPTOMS.map((s) => s.id)
  const flagOptions = ready ? parameterOptions.effective.flag.map((o) => o.label) : FLAGS.map((f) => f.id)

  // Configured note fields for this activity (e.g. Sleep's "Dreams"), from its header button.
  const configured = draft?.cardName ? displayButtonForActivityName(draft.cardName) : undefined
  const secondaryNoteLabel = configured?.noteFields?.find((f) => f.fieldKind === 'text' && f.key === 'secondary')?.label
  const multiselectFields = (configured?.noteFields ?? []).filter((f) => f.fieldKind === 'multiselect')
  // Counted in songs (Worship): the duration is songs × minutes-per-song.
  const bySongs = configured?.input === 'songCount'

  // Room: the same continuous-block ceiling every placement is validated against.
  const list = useMemo(() => schedulingList(axis), [axis])
  const ceiling = draft ? maxContiguousDuration(list, draft.start, editing?.activity.id ?? null, LUMEN_AXIS_BOUNDS) : 0
  const startInDay = draft ? isInLumenDay(draft.start) : false
  // An entry that started the evening before belongs to the previous Lumen
  // day; its time is changed there, where everything around it is loaded.
  const startedBefore = editing !== null && editing.start < LUMEN_DAY_START
  const problem = !draft
    ? null
    : startedBefore
      ? null
      : !startInDay
      ? 'Start between 6 AM and 6 AM the next morning'
      : ceiling === 0
        ? 'Something is already logged at that time'
        : draft.duration > ceiling
          ? `Only ${formatDuration(ceiling)} free from ${axisClock(draft.start)}`
          : draft.duration < 1
            ? 'Choose how long'
            : null

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d))

  function pickCard(c: ActivityCard) {
    // Default to the usual 30 minutes, or whatever room there is.
    const room = draft ? maxContiguousDuration(list, draft.start, null, LUMEN_AXIS_BOUNDS) : DEFAULT_DURATION
    set({ cardName: c.name, path: [], duration: Math.max(1, Math.min(DEFAULT_DURATION, room || DEFAULT_DURATION)) })
  }

  function back() {
    if (!draft) return
    if (draft.path.length > 0) set({ path: draft.path.slice(0, -1) })
    else if (draft.cardName && !editing) set({ cardName: null })
    else if (target?.kind === 'new' && target.tileId === null) set({ tileId: null })
  }

  function submit() {
    if (!draft || !draft.cardName || problem || submitting) return
    setSubmitting(true) // rule 9: no double submit
    const context = {
      quality: draft.quality,
      symptoms: draft.symptoms,
      flags: draft.flag ? [draft.flag] : [],
      notes: draft.notes.trim() ? draft.notes.trim() : null,
      dreamsNote: draft.dreamsNote.trim() ? draft.dreamsNote.trim() : null,
      fieldSelections: draft.fieldSelections,
    }
    const ok = editing
      ? updateActivity(editing.activity.id, { start: draft.start, durationMinutes: draft.duration, path: draft.path, context })
      : logActivity({ activity: { name: draft.cardName, path: draft.path }, start: draft.start, durationMinutes: draft.duration, context })
    if (ok) onClose()
    else setSubmitting(false)
  }

  const canGoBack =
    step === 'activity'
      ? (draft?.path.length ?? 0) > 0 || (target?.kind === 'new' && target.tileId === null)
      : step === 'details' && !editing && ((draft?.path.length ?? 0) > 0 || Boolean(card))
  const title =
    step === 'tile' ? 'Log activity' : step === 'activity' ? (node && draft?.cardName ? node.name : tile?.label) : draft?.cardName
  const crumbs = draft?.path.length ? draft.path.join(' · ') : null
  const endsNextDay = draft ? draft.start + draft.duration > 1440 && draft.start < 1440 : false

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={title ?? 'Log activity'}
      description={
        step === 'details' && draft ? (
          <span className="tabular">
            {crumbs ? `${crumbs} · ` : ''}
            {axisClock(draft.start)}–{axisClock(draft.start + draft.duration)}
          </span>
        ) : step === 'activity' && tile ? (
          tile.label
        ) : draft ? (
          <span className="tabular">From {axisClock(draft.start)}</span>
        ) : undefined
      }
      leading={
        canGoBack ? (
          <Button variant="ghost" size="icon" className="-ml-2 h-10 w-10" aria-label="Back" onClick={back}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
        ) : tile ? (
          <IconBubble icon={tile.icon} color={tile.color.id} />
        ) : undefined
      }
      footer={
        step === 'details' && draft ? (
          <div className="flex items-center gap-2">
            {editing && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Delete entry"
                  onClick={() => {
                    removeActivity(editing.activity.id)
                    onClose()
                  }}
                >
                  <Trash2 className="h-[18px] w-[18px]" />
                </Button>
                <Button
                  variant={editing.activity.status === 'completed' ? 'active' : 'quiet'}
                  aria-pressed={editing.activity.status === 'completed'}
                  onClick={() => data.toggleComplete(editing.activity.id)}
                >
                  {editing.activity.status === 'completed' ? <CircleCheck className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                  Done
                </Button>
              </>
            )}
            <Button variant="primary" size="lg" className="ml-auto min-w-[140px] flex-1 sm:flex-none" disabled={Boolean(problem) || submitting} onClick={submit}>
              {editing ? 'Save' : `Log ${formatDuration(draft.duration)}`}
            </Button>
          </div>
        ) : undefined
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        {step === 'tile' && (
          <motion.ul key="tiles" {...slide(-1)} className="flex flex-col gap-1">
            {tiles.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => set({ tileId: t.id })}
                  className="flex min-h-14 w-full items-center gap-3 rounded-control px-2 text-left transition-colors hover:bg-white/[0.04] active:bg-white/[0.07]"
                >
                  <IconBubble icon={t.icon} color={t.color.id} />
                  <span className="flex-1 text-[15px] text-ink">{t.label}</span>
                  <span className="text-xs text-ink-faint">{t.cards.length}</span>
                  <ChevronRight className="h-4 w-4 text-ink-faint" />
                </button>
              </li>
            ))}
          </motion.ul>
        )}

        {step === 'activity' && draft && (
          <motion.ul
            key={`${draft.tileId}/${draft.cardName ?? ''}/${draft.path.join('/')}`}
            {...slide(1)}
            className="flex flex-col gap-1.5"
            aria-label="Activity"
          >
            {(draft.cardName ? node?.children ?? [] : tile?.cards ?? []).map((option) => {
              const deeper = Boolean(option.children?.length)
              // Only top-level activities carry the "done for the day" rule, as in Classic.
              const topLevel = !draft.cardName
              const done = topLevel && isCardDone(option)
              const manual = topLevel && option.disappear.mode === 'manual'
              return (
                <li key={option.name} className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={done}
                    onClick={() => (draft.cardName ? set({ path: [...draft.path, option.name] }) : pickCard(option))}
                    className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-control border border-line/[0.07] bg-white/[0.02] px-4 text-left transition-colors duration-150 hover:border-line/[0.14] hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <span className="flex-1 truncate text-[15px] text-ink">{option.name}</span>
                    {done ? (
                      <span className="text-xs text-mint">Done today</span>
                    ) : (
                      <>
                        {deeper && <span className="text-xs text-ink-faint">{option.children!.length}</span>}
                        <ChevronRight className="h-4 w-4 text-ink-faint" />
                      </>
                    )}
                  </button>
                  {manual && (
                    <button
                      type="button"
                      aria-pressed={done}
                      aria-label={done ? `Mark ${option.name} not done` : `Mark ${option.name} done for today`}
                      title={done ? 'Undo done' : 'Done for today'}
                      onClick={() => toggleCardDone(option.name)}
                      className={cn(
                        'grid h-14 w-12 shrink-0 place-items-center rounded-control border transition-colors',
                        done ? 'border-mint/40 bg-mint/[0.08] text-mint' : 'border-line/[0.07] text-ink-faint hover:text-ink',
                      )}
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                </li>
              )
            })}
            {!draft.cardName && (tile?.cards.length ?? 0) === 0 && (
              <li className="rounded-tile border border-dashed border-line/10 px-4 py-6 text-center text-sm text-ink-muted">
                No activities in this tile yet. Add some from Edit.
              </li>
            )}
          </motion.ul>
        )}

        {step === 'details' && draft && (
          <motion.div key="details" {...slide(1)} className="flex flex-col gap-6">
            {startedBefore ? (
              <section aria-label="When" className="flex items-center justify-between gap-3 rounded-tile border border-line/[0.07] bg-white/[0.02] px-4 py-3">
                <p className="text-sm text-ink-muted">
                  Started {weekdayShort(addDays(day, -1))} at {axisClock(draft.start)} · {formatDuration(draft.duration)}
                </p>
                <Button
                  variant="ghost"
                  className="-mr-2 h-9 shrink-0 px-3 text-accent-ink"
                  onClick={() => {
                    onClose()
                    setDay(addDays(day, -1))
                  }}
                >
                  Change time
                </Button>
              </section>
            ) : (
            <section aria-label="When" className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <TimeField
                  label="Start"
                  value={axisClock(draft.start)}
                  onChange={(clock) => set({ start: axisFromClock(clock) })}
                />
                {bySongs ? (
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-ink-muted">Songs</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={Math.max(1, Math.round(draft.duration / WORSHIP_MINUTES_PER_SONG))}
                      onChange={(e) => {
                        const minutes = songCountToMinutes(Number.parseInt(e.target.value, 10))
                        if (minutes !== null) set({ duration: minutes })
                      }}
                      className="h-11 rounded-control border border-line/[0.09] bg-surface-2/60 px-3.5 text-[15px] tabular text-ink focus-visible:border-accent-ink/60"
                    />
                  </label>
                ) : (
                  <TimeField
                    label="End"
                    value={axisClock(draft.start + draft.duration)}
                    hint={endsNextDay ? weekdayShort(addDays(day, 1)) : undefined}
                    onChange={(clock) => set({ duration: durationToClock(draft.start, clock) })}
                  />
                )}
              </div>
              {!bySongs && (
              <div role="group" aria-label="Duration" className="flex flex-wrap gap-2">
                {QUICK_DURATIONS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={draft.duration === m}
                    disabled={m > ceiling}
                    onClick={() => set({ duration: m })}
                    className={cn(
                      'h-9 rounded-full border px-3.5 text-sm tabular transition-colors disabled:opacity-30',
                      draft.duration === m
                        ? 'border-accent-ink/50 bg-accent/[0.14] text-ink'
                        : 'border-line/[0.09] bg-white/[0.02] text-ink-muted hover:text-ink',
                    )}
                  >
                    {formatDuration(m)}
                  </button>
                ))}
              </div>
              )}
              <p className={cn('text-sm', problem ? 'text-danger' : 'text-ink-faint')} role={problem ? 'alert' : undefined}>
                {problem ?? `${formatDuration(draft.duration)}${ceiling < 24 * 60 ? ` · up to ${formatDuration(ceiling)} free here` : ''}`}
              </p>
            </section>
            )}

            <button
              type="button"
              aria-expanded={showDetails}
              onClick={() => setShowDetails((s) => !s)}
              className="-mx-2 flex min-h-11 items-center justify-between rounded-control px-2 text-sm font-medium text-ink-muted transition-colors hover:bg-white/[0.03] hover:text-ink"
            >
              How it went
              <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', showDetails && 'rotate-180')} />
            </button>

            {showDetails && (
              <div className="-mt-3 flex flex-col gap-6">
                <ChoiceChips
                  label="Activity quality"
                  options={qualityOptions}
                  selected={draft.quality}
                  onToggle={(q) => q && set({ quality: toggle(draft.quality, q) })}
                />
                <ChoiceChips
                  label="Chronic symptoms"
                  options={symptomOptions}
                  selected={draft.symptoms}
                  onToggle={(s) => s && set({ symptoms: toggle(draft.symptoms, s) })}
                />
                <ChoiceChips
                  label="Protective response"
                  mode="single"
                  options={flagOptions}
                  selected={draft.flag ? [draft.flag] : []}
                  onToggle={(f) => set({ flag: f === draft.flag ? null : f })}
                />
                {multiselectFields.map((field) => (
                  <ChoiceChips
                    key={field.id}
                    label={field.label}
                    options={field.options}
                    selected={draft.fieldSelections[field.id] ?? []}
                    onToggle={(v) =>
                      v && set({ fieldSelections: { ...draft.fieldSelections, [field.id]: toggle(draft.fieldSelections[field.id] ?? [], v) } })
                    }
                  />
                ))}
                <TextArea label="Notes" value={draft.notes} onChange={(notes) => set({ notes })} />
                {secondaryNoteLabel && (
                  <TextArea label={secondaryNoteLabel} value={draft.dreamsNote} onChange={(dreamsNote) => set({ dreamsNote })} />
                )}
              </div>
            )}

            {editing && <ReflectionsSection activity={editing.activity} />}
          </motion.div>
        )}
      </AnimatePresence>
    </Sheet>
  )
}

const slide = (dir: 1 | -1) => ({
  initial: { opacity: 0, x: 12 * dir },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 12 * dir },
  transition: { duration: 0.18 },
})

const toggle = (list: readonly string[], value: string) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value]

function TimeField({ label, value, hint, onChange }: { label: string; value: string; hint?: string; onChange: (clock: number) => void }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between text-xs font-medium text-ink-muted">
        {label}
        {hint && <span className="font-normal text-ink-faint">{hint}</span>}
      </span>
      <input
        type="time"
        value={value}
        onChange={(e) => {
          const clock = clockOf(e.target.value)
          if (clock !== null) onChange(clock)
        }}
        className="h-11 rounded-control border border-line/[0.09] bg-surface-2/60 px-3.5 text-[15px] tabular text-ink [color-scheme:dark] focus-visible:border-accent-ink/60"
      />
    </label>
  )
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-ink-muted">{label}</span>
      <textarea
        value={value}
        rows={3}
        onChange={(e) => onChange(e.target.value)}
        className="resize-y rounded-control border border-line/[0.09] bg-surface-2/60 px-3.5 py-3 text-[15px] text-ink placeholder:text-ink-faint focus-visible:border-accent-ink/60"
      />
    </label>
  )
}

