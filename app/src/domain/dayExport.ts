/**
 * Pure assembly of "everything recorded for one calendar day" into a plain
 * data shape — the "download this day's data" feature. No React, no PDF
 * library import here (mirrors `domain/scheduling.ts`/`domain/notes.ts`
 * keeping this kind of logic component- and I/O-free); `lib/dayExportPdf.ts`
 * is the thin rendering layer that turns `DayExportData` into an actual file.
 *
 * Which calendar day an activity belongs to (rule 2): a midnight-crossing
 * activity is stored as ONE row, anchored to the calendar day it STARTED on
 * (`ScheduledActivity.localDate`) — its `durationMinutes` may push its end
 * past local midnight, but the row itself never moves to the next day. This
 * export follows that exactly: it includes every activity whose `localDate`
 * equals the viewed day, in full (start time + its whole duration, even the
 * portion that plays out after midnight), and excludes an activity that
 * started the PREVIOUS day even if it is still running when this day's
 * midnight ticks over — that activity's `localDate` names yesterday, so it
 * belongs to yesterday's export, not today's. See `domain/dayExport.test.ts`.
 *
 * Deliberately keyed off `localDate` (a real midnight-to-midnight calendar
 * day), not the 6am-to-6am "window day" `domain/window.ts` renders the
 * timeline in — this is a full-record export of one calendar day, not a
 * rendering of the timeline's own window.
 */
import { formatDuration } from './quickLog'
import { formatActivityRange } from './slots'
import {
  DISPLAY_BUTTONS,
  displayButtonQuickLogName,
  formatDisplayValue,
  type DisplayButtonKey,
} from './displayButtons'
import { formatNoteTimestamp, noteButtonLabel, type NoteEntry } from './notes'
import { localDateISO } from '@/lib/localTime'
import type { ActivityList } from './types'

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
  reflections: ExportReflectionEntry[]
}

export interface ExportNoteEntry {
  id: string
  buttonLabel: string
  entryType: string | null
  note: string
  timestampLabel: string
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
  /** True when every section above is empty — the renderer shows a calm "nothing logged" page instead of blank sections. */
  isEmpty: boolean
}

export interface DayExportInput {
  viewedDate: Date
  /** The full, unfiltered client activity list (`state.activities`) — this assembles its own day filter from `localDate`. */
  activities: ActivityList
  /**
   * Every note entry already scoped to this calendar day (e.g.
   * `apiListNoteEntriesForDate`'s result) — or `[]` when local-only mode has
   * no backend, or the scoped fetch failed. Never filtered further here.
   */
  noteEntries: NoteEntry[]
  /**
   * Raw values for display buttons that are NOT derivable from `activities`
   * (Steps — a plain local-only per-day counter, see
   * `lib/displayValuesLocalStore.ts`). A quick-log button (Vipassana) is
   * always computed from `activities` instead, so it never needs an entry
   * here. `null`/omitted means "not set" — the button is left out of the
   * export entirely, per "if set".
   */
  localDisplayValues?: Partial<Record<DisplayButtonKey, number | null>>
  /** Resolves a reflection card number to its display title (`data/reflectionCards.ts`, kept out of this pure module). */
  reflectionCardTitle: (card: number) => string
}

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

export function assembleDayExport(input: DayExportInput): DayExportData {
  const dateKey = localDateISO(input.viewedDate)

  const dayActivities = input.activities
    .filter((a) => a.localDate === dateKey && a.durationMinutes > 0 && a.name !== null)
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
      entryType: entry.entryType,
      note: entry.note,
      timestampLabel: formatNoteTimestamp(new Date(entry.createdAt)),
    }))

  const localDisplayValues = input.localDisplayValues ?? {}
  const displayValues: ExportDisplayValue[] = []
  for (const button of DISPLAY_BUTTONS) {
    const quickLogName = displayButtonQuickLogName(button.key)
    let raw: number | null
    if (quickLogName) {
      // Computed from the SAME localDate-filtered set the activities section
      // shows — not the timeline's 6am-to-6am window mapping — so the total
      // here always reconciles with what's listed above it.
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

  return {
    dateLabel: formatDateLabel(input.viewedDate),
    isoDate: dateKey,
    activities,
    noteEntries,
    displayValues,
    isEmpty: activities.length === 0 && noteEntries.length === 0 && displayValues.length === 0,
  }
}
