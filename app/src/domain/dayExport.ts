/**
 * Pure assembly of "everything recorded for one calendar day" into a plain
 * data shape — the "download this day's data" feature. No React, no PDF
 * library import here (mirrors `domain/scheduling.ts`/`domain/notes.ts`
 * keeping this kind of logic component- and I/O-free); `lib/dayExportPdf.ts`
 * is the thin rendering layer that turns `DayExportData` into an actual file.
 *
 * Which calendar day an activity belongs to (rule 2): unlike a model that
 * stores every day's activities in one combined list keyed by an explicit
 * per-row calendar-day field, this client's `BoardContext` already loads and
 * persists `state.activities` ONE CALENDAR DAY AT A TIME — the whole board is
 * always scoped to whichever day is being viewed (see
 * `BoardContext.tsx`'s `loadActivitiesForDate`/`saveLocalActivities`, both
 * keyed by `viewedDate`). A midnight-crossing activity (rule 2) is stored
 * under the day it STARTED on and never appears in the next day's board, so
 * by the time `activities` reaches this module it is already exactly "this
 * calendar day's activities, in full, including the tail of anything that
 * plays out past midnight" — there is no further day-filtering for this
 * module to do. This is deliberately NOT keyed off any 6am-to-6am "window
 * day" some other rendering might use — it is a full-record export of one
 * real calendar day.
 */
import { formatDuration } from './quickLog'
import { formatActivityRange } from './slots'
import {
  DISPLAY_BUTTONS,
  displayButtonQuickLogName,
  formatDisplayValue,
  type DisplayButtonKey,
} from './displayButtons'
import { formatEntryTypes, formatNoteTimestamp, noteButtonLabel, type NoteEntry } from './notes'
import { localDateISO } from '@/lib/localTime'
import { hasFieldValues, recordedFields, type ActivityField } from './activityFields'
import { fullDayChecklist, type SupplementCompletion, type SupplementItemConfig } from './supplements'
import type { ActivityList, ScheduledActivity } from './types'

export interface ExportReflectionEntry {
  card: number
  title: string
  note: string
}

export interface ExportActivity {
  id: string
  name: string
  /** Drill-down breadcrumb, already joined for display (e.g. "Oiling · Body"), or `null` for a flat card. */
  pathLabel: string | null
  timeRangeLabel: string
  durationLabel: string
  quality: string[]
  symptoms: string[]
  /** At most one (rule: "Protective response" is single-select) — `null` when none was recorded. */
  flag: string | null
  notes: string | null
  /** The second text note (Sleep's "Dreams" by default) — `null` when none was written. */
  dreams: string | null
  /** Multiple-select choices recorded on the entry (e.g. "How was your sleep?"), one row per field that has any. */
  selections: ExportField[]
  /**
   * The activity's own notes and multiple-select fields as recorded on this entry, in order — set when
   * the entry used them, in which case the fixed quality / symptoms / protective-response / notes above
   * are not printed. `null` keeps the original fixed layout (older entries, or fields not available).
   */
  customFields: ExportField[] | null
  reflections: ExportReflectionEntry[]
}

export interface ExportField {
  label: string
  /** A note's text, or a multiple-select field's choices joined for display ("—" when none). */
  value: string
}

export interface ExportNoteEntry {
  id: string
  buttonLabel: string
  /** Every picked type, already joined for display ("Dreamer, The Voice"); `null` when none. */
  entryType: string | null
  note: string
  timestampLabel: string
}

export interface ExportChecklistItem {
  label: string
  done: boolean
  note: string
}

/** One checklist button's state for the day. Only checklists the user touched that day are exported. */
export interface ExportChecklist {
  label: string
  items: ExportChecklistItem[]
}

export interface ExportDisplayValue {
  label: string
  valueLabel: string
}

export interface DayExportData {
  /** e.g. "Friday, September 11, 2026" — device-locale, long form. */
  dateLabel: string
  /** `YYYY-MM-DD` — used for the downloaded file's name. */
  isoDate: string
  activities: ExportActivity[]
  noteEntries: ExportNoteEntry[]
  displayValues: ExportDisplayValue[]
  checklists: ExportChecklist[]
  /** True when every section above is empty — the renderer shows a calm "nothing logged" page instead of blank sections. */
  isEmpty: boolean
}

export interface DayExportInput {
  viewedDate: Date
  /**
   * The board for the viewed day — `state.activities`, already scoped to
   * `viewedDate` by `BoardContext` (see this module's own doc comment for
   * why no further day-filtering happens here).
   */
  activities: ActivityList
  /**
   * Every note entry already scoped to this calendar day (e.g.
   * `apiListNoteEntriesForDate`'s result) — or `[]` when local-only mode has
   * no backend, or the scoped fetch failed. Never filtered further here.
   */
  noteEntries: NoteEntry[]
  /**
   * Raw values for display buttons that are NOT derivable from `activities`
   * (Steps — a plain per-day counter; synced to `public.daily_values` but
   * still read from its local-first cache here, see
   * `lib/displayValuesLocalStore.ts`, since this export's assembly is pure
   * and synchronous). A quick-log button (Vipassana) is always computed from
   * `activities` instead, so it never needs an entry here. `null`/omitted
   * means "not set" — the button is left out of the export entirely, per "if
   * set".
   */
  localDisplayValues?: Partial<Record<DisplayButtonKey, number | null>>
  /** Resolves a reflection card number to its display title (`data/reflectionCards.ts`, kept out of this pure module). */
  reflectionCardTitle: (card: number) => string
  /**
   * Every number button the user has — quick-log minutes and daily numbers alike, user-added ones
   * included, under their own current label. Defaults to the built-in set. Values for daily numbers
   * come from `localDisplayValues` under the same `key`.
   */
  numberButtons?: readonly { key: DisplayButtonKey; label: string }[]
  /** The checklist buttons and what was ticked on the viewed day — see `ExportChecklist`. */
  checklists?: readonly { label: string; items: readonly SupplementItemConfig[]; completions: readonly SupplementCompletion[] }[]
  /** Resolves a multiple-select field id to its label (from the button config), when known. */
  noteFieldLabel?: (fieldId: string) => string | undefined
  /** The activity's own fields (hidden included) for an entry, or undefined when unavailable — see `ExportActivity.customFields`. */
  fieldsForActivity?: (activity: ScheduledActivity) => readonly ActivityField[] | undefined
}

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

function customFieldsFor(
  activity: ScheduledActivity,
  fieldsFor: DayExportInput['fieldsForActivity'],
): ExportField[] | null {
  const fields = fieldsFor?.(activity)
  if (!fields || !activity.fieldValues || !hasFieldValues(activity.fieldValues)) return null
  return recordedFields(fields, activity.fieldValues).map((f) => ({
    label: f.label,
    value: f.kind === 'text' ? (f.text ?? '') : f.labels.length > 0 ? f.labels.join(', ') : '—',
  }))
}

export function assembleDayExport(input: DayExportInput): DayExportData {
  const dayActivities = input.activities
    .filter((a) => a.durationMinutes > 0 && a.name !== null)
    .slice()
    .sort((a, b) => a.startMinutes - b.startMinutes)

  const activities: ExportActivity[] = dayActivities.map((a) => ({
    id: a.id,
    name: a.name as string,
    pathLabel: a.path.length > 0 ? a.path.join(' · ') : null,
    timeRangeLabel: formatActivityRange(a.startMinutes, a.durationMinutes),
    durationLabel: formatDuration(a.durationMinutes),
    quality: [...a.quality],
    symptoms: [...a.symptoms],
    flag: a.flags[0] ?? null,
    notes: a.notes,
    dreams: a.dreamsNote && a.dreamsNote.trim() ? a.dreamsNote : null,
    selections: Object.entries(a.fieldSelections ?? {})
      .filter(([, values]) => values.length > 0)
      .map(([fieldId, values]) => ({
        label: input.noteFieldLabel?.(fieldId) ?? 'Selections',
        value: values.join(', '),
      })),
    customFields: customFieldsFor(a, input.fieldsForActivity),
    reflections: a.reflections.map((r) => ({
      card: r.card,
      title: input.reflectionCardTitle(r.card),
      note: r.note,
    })),
  }))

  const noteEntries: ExportNoteEntry[] = input.noteEntries
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((entry) => ({
      id: entry.id,
      buttonLabel: noteButtonLabel(entry.buttonKey),
      entryType: entry.entryTypes.length > 0 ? formatEntryTypes(entry.entryTypes) : null,
      note: entry.note,
      timestampLabel: formatNoteTimestamp(new Date(entry.createdAt)),
    }))

  const localDisplayValues = input.localDisplayValues ?? {}
  const displayValues: ExportDisplayValue[] = []
  const numberButtons = input.numberButtons ?? DISPLAY_BUTTONS.map((b) => ({ key: b.key, label: b.label }))
  for (const button of numberButtons) {
    const quickLogName = displayButtonQuickLogName(button.key)
    let raw: number | null
    if (quickLogName) {
      // Computed from the SAME set the activities section shows above — not
      // some separately-fetched total — so the number here always reconciles
      // with what's listed in the Activities section.
      const total = dayActivities
        .filter((a) => a.name === quickLogName)
        .reduce((sum, a) => sum + a.durationMinutes, 0)
      raw = total > 0 ? total : null
    } else {
      raw = localDisplayValues[button.key] ?? null
    }
    if (raw !== null) {
      displayValues.push({ label: button.label, valueLabel: formatDisplayValue(button.key, raw) })
    }
  }

  const checklists: ExportChecklist[] = []
  for (const checklist of input.checklists ?? []) {
    const day = fullDayChecklist(checklist.items, localDateISO(input.viewedDate), checklist.completions)
    if (!day.some((entry) => entry.done || entry.note.trim())) continue
    checklists.push({
      label: checklist.label,
      items: day.map((entry) => ({
        label: checklist.items.find((item) => item.key === entry.itemKey)?.label ?? entry.itemKey,
        done: entry.done,
        note: entry.note.trim(),
      })),
    })
  }

  return {
    dateLabel: formatDateLabel(input.viewedDate),
    isoDate: localDateISO(input.viewedDate),
    activities,
    noteEntries,
    displayValues,
    checklists,
    isEmpty:
      activities.length === 0 && noteEntries.length === 0 && displayValues.length === 0 && checklists.length === 0,
  }
}
