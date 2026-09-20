/**
 * "Display buttons" — header controls that always show a stored number on
 * their face (not just when opened). Pure types + formatting only.
 *
 * `input` is HOW the value is entered: `'number'` types the number straight
 * in; `'duration'` enters a start and end clock time (like the Sun / Moon
 * exposure log) and stores the minutes between them; `'songCount'`
 * (Worship only) enters a start time plus a number of songs and computes the
 * duration as `count × WORSHIP_MINUTES_PER_SONG` — see that constant below.
 * The stored value and its face format are the same regardless of entry
 * mode — a `'min'` count.
 *
 * `quickLogName`, when set, means this button is `entry_mode: 'quick_log'`
 * in `public.activities` (see the full-stack-engineer agent definition's
 * Phase 2 scope) — its face value is a COMPUTED sum of today's real
 * `ScheduledActivity` rows for this catalog name, and Save creates a new one
 * of those (via the shared scheduling module) rather than writing to
 * `lib/displayValuesLocalStore.ts`. Seven buttons are quick-log today:
 * Vipassana, Exercise (`'Sports or Exercise'` — an EXISTING catalog card,
 * reused, never a parallel identity), Breathing (`'Breathwork'`, same
 * reasoning), Sleep, Prayer, Sermons and Worship (all three genuinely new
 * cards — see `data/activities.ts`). Prayer/Sermons/Worship replace what
 * used to be pure freeform-note header pills (`domain/notes.ts`'s
 * `NOTE_BUTTONS`) — a note alone never blocked real time on the Timeline,
 * so a confirmed product round moved all three onto the same real-scheduling
 * mechanism every other quick-log button already uses.
 *
 * A quick-log button may additionally carry:
 *   - `quickLogType` — a single-select "type" field, options drawn straight
 *     from that catalog card's own `sub` list (`data/activities.ts`) so the
 *     type vocabulary lives in exactly one place; the chosen value becomes
 *     the logged activity's `path`, identically to picking a sub-option via
 *     the tile-row drill-down. Exercise, Breathing and Sleep all have one.
 *   - `quickLogNote` — a plain freeform note field, stored on the logged
 *     activity's existing `notes` field (rule 10 encrypted, same as every
 *     other activity's notes).
 *   - `quickLogSleepQuality` / `quickLogDreamsNote` — Sleep-only. Its own
 *     11-value vocabulary (`SleepQualityId`, deliberately separate from the
 *     18-value `ActivityQuality` used everywhere else) and a SECOND,
 *     separate note field ("Dreams") from the plain note above. See
 *     `ScheduledActivity.sleepQuality`/`.dreamsNote` in domain/types.ts.
 *
 * `Steps` and `Protein` are plain per-day set/replace numbers (re-entering
 * REPLACES the day's value, never adds to it) with no catalog counterpart —
 * `input: 'number'`. Both are `synced: true` — a real per-user row in
 * `public.daily_values`, local-first (instant on this device) with a
 * background sync, mirroring every other Phase-2+ control (see
 * `state/useDailyValue.ts`). `Steps` was, for a while, an explicitly-flagged
 * exception that stayed on purely local storage
 * (`lib/displayValuesLocalStore.ts`) while `Protein` got the real table —
 * that was a deliberate, scoped call at the time (not an oversight), but it
 * left Steps as the one control whose data never reached the database: lost
 * on every device switch, browser change, or reinstall. A full audit
 * flagged that as the app's one confirmed data-loss gap, so Steps now
 * follows the exact same `synced: true` path Protein already does — see the
 * migration that widened `public.daily_values.metric_key` to allow
 * `'steps'`. Any Steps value already sitting in a browser's `localStorage`
 * from before this migration is picked up by a one-time backfill
 * (`state/useStepsBackfill.ts`), not silently dropped.
 *
 * `lib/displayValuesLocalStore.ts` itself hasn't gone anywhere — it's still
 * the local-first cache BOTH synced buttons read/write through instantly
 * (rule 6), same as before; only "does a background sync happen at all" was
 * ever the Steps/Protein difference, and now there is none.
 *
 * `unit: 'target'` (Protein only) formats against a fixed daily `target`
 * rather than showing the bare number — `formatTargetRelativeValue` below,
 * generalized so a future target-based button can reuse it.
 */

export const DISPLAY_BUTTONS = [
  { key: 'vipassana', label: 'Vipassana', unit: 'min', input: 'duration', quickLogName: 'Vipassana', noteFields: [] as NoteFieldConfig[] },
  { key: 'steps', label: 'Steps', unit: 'int', input: 'number', synced: true, noteFields: [] as NoteFieldConfig[] },
  {
    key: 'exercise',
    label: 'Exercise',
    unit: 'min',
    input: 'duration',
    quickLogName: 'Sports or Exercise',
    quickLogType: true,
    quickLogTypeLabel: 'Type',
    noteFields: [{ key: 'primary', label: 'Note' }] as NoteFieldConfig[],
  },
  {
    key: 'breathing',
    label: 'Breathing',
    unit: 'min',
    input: 'duration',
    quickLogName: 'Breathwork',
    quickLogType: true,
    quickLogTypeLabel: 'Type',
    noteFields: [{ key: 'primary', label: 'Note' }] as NoteFieldConfig[],
  },
  {
    key: 'sleep',
    label: 'Sleep',
    unit: 'min',
    input: 'duration',
    quickLogName: 'Sleep',
    quickLogType: true,
    quickLogTypeLabel: 'Sleep type',
    quickLogSleepQuality: true,
    noteFields: [
      { key: 'primary', label: 'Note' },
      { key: 'secondary', label: 'Dreams' },
    ] as NoteFieldConfig[],
  },
  {
    key: 'prayer',
    label: 'Prayer',
    unit: 'min',
    input: 'duration',
    quickLogName: 'Prayer',
    quickLogType: true,
    quickLogTypeLabel: 'Type',
    noteFields: [{ key: 'primary', label: 'Note' }] as NoteFieldConfig[],
  },
  {
    key: 'sermons',
    label: 'Sermons',
    unit: 'min',
    input: 'duration',
    quickLogName: 'Sermons',
    noteFields: [{ key: 'primary', label: 'Note' }] as NoteFieldConfig[],
  },
  // Worship's entry mode is genuinely different from every other quick-log
  // button — a Start time plus a NUMBER OF SONGS, not a Start/End pair (see
  // `'songCount'` and `WORSHIP_MINUTES_PER_SONG` below). No `quickLogType` —
  // the `Worship` catalog card carries no `sub` list to draw options from.
  {
    key: 'worship',
    label: 'Worship',
    unit: 'min',
    input: 'songCount',
    quickLogName: 'Worship',
    noteFields: [{ key: 'primary', label: 'Note' }] as NoteFieldConfig[],
  },
  { key: 'protein', label: 'Protein', unit: 'target', input: 'number', target: 80, synced: true, noteFields: [] as NoteFieldConfig[] },
] as const

interface NoteFieldConfig {
  key: 'primary' | 'secondary'
  label: string
}

/** One button, in the shape every lookup function below reads — either a `DISPLAY_BUTTONS` literal or a `HeaderButtonConfig`-derived row from the dynamic registry (`setDisplayButtonsRegistry`). */
export interface DisplayButtonLike {
  /** The identity every lookup function is keyed by — the `HeaderButtonConfig.id` once dynamic (React key / local-cache key), or the literal string for a `DISPLAY_BUTTONS` default. */
  key: string
  /** The `public.daily_values.metric_key` a 'day_value' button actually writes under — `public.header_buttons.key` once dynamic. Falls back to `key` for a `DISPLAY_BUTTONS` default, where the two happen to be the same string. Irrelevant for a `quickLogName` button. */
  storageKey?: string
  label: string
  unit: 'min' | 'int' | 'target'
  input: 'number' | 'duration' | 'songCount'
  quickLogName?: string
  quickLogType?: boolean
  quickLogTypeLabel?: string
  quickLogSleepQuality?: boolean
  noteFields?: readonly NoteFieldConfig[]
  synced?: boolean
  target?: number
}

export type DisplayButtonKey = string
export type DisplayButtonUnit = DisplayButtonLike['unit']
export type DisplayButtonInput = DisplayButtonLike['input']

/**
 * Populated once `state/useHeaderButtons.ts` has resolved the effective
 * per-user 'activity'/'day_value' button list (system defaults + this
 * user's own additions) — every lookup below reads through this when it's
 * set, falling back to the hardcoded `DISPLAY_BUTTONS` before that first
 * resolution (or with no backend configured at all, rule 6). `null` clears
 * it back to the hardcoded default list.
 */
let registry: readonly DisplayButtonLike[] | null = null

export function setDisplayButtonsRegistry(buttons: readonly DisplayButtonLike[] | null): void {
  registry = buttons
}

function findButton(key: DisplayButtonKey): DisplayButtonLike | undefined {
  return (registry ?? DISPLAY_BUTTONS).find((button) => button.key === key)
}

export function displayButtonLabel(key: DisplayButtonKey): string {
  return findButton(key)?.label ?? key
}

/** The real `daily_values.metric_key` to write under — see `DisplayButtonLike.storageKey`'s own doc comment. */
export function displayButtonStorageKey(key: DisplayButtonKey): string {
  const button = findButton(key)
  return button?.storageKey ?? button?.key ?? key
}

export function displayButtonUnit(key: DisplayButtonKey): DisplayButtonUnit {
  return findButton(key)?.unit ?? 'int'
}

export function displayButtonInput(key: DisplayButtonKey): DisplayButtonInput {
  return findButton(key)?.input ?? 'number'
}

/** The catalog name this button quick-logs real activities under, or `null` for a plain day-value button (Steps/Protein). */
export function displayButtonQuickLogName(key: DisplayButtonKey): string | null {
  const button = findButton(key)
  return (button && 'quickLogName' in button ? button.quickLogName : null) ?? null
}

/** Whether this quick-log button offers a single-select "type" field (its options come from the catalog card's own `sub` list — see `data/activities.ts`). */
export function displayButtonQuickLogType(key: DisplayButtonKey): boolean {
  const button = findButton(key)
  return !!(button && 'quickLogType' in button && button.quickLogType)
}

/** Label for the type field (only meaningful when `displayButtonQuickLogType` is true). */
export function displayButtonQuickLogTypeLabel(key: DisplayButtonKey): string {
  const button = findButton(key)
  return (button && 'quickLogTypeLabel' in button ? button.quickLogTypeLabel : null) ?? 'Type'
}

/**
 * The button's configured note field(s) — generalizes the old hardcoded
 * `quickLogNote`/`quickLogDreamsNote` pair to any number (in practice 0–2,
 * the physical limit `scheduled_activities` has for a note-shaped column —
 * see `20260920060000_header_buttons.sql`'s own doc comment) of freely
 * labeled fields.
 */
export function displayButtonNoteFields(key: DisplayButtonKey): readonly NoteFieldConfig[] {
  return findButton(key)?.noteFields ?? []
}

/** Whether this quick-log button offers its `'primary'` note field (was `quickLogNote`). */
export function displayButtonQuickLogNote(key: DisplayButtonKey): boolean {
  return displayButtonNoteFields(key).some((field) => field.key === 'primary')
}

/** This button's label for its `'primary'` note field's placeholder — e.g. `"Note"`, or Sleep's own choice if renamed. */
export function displayButtonNoteFieldLabel(key: DisplayButtonKey, fieldKey: 'primary' | 'secondary'): string {
  return displayButtonNoteFields(key).find((field) => field.key === fieldKey)?.label ?? (fieldKey === 'primary' ? 'Note' : 'Dreams')
}

/** Whether this button shows the fixed 11-value "How was your sleep?" multi-select (Sleep by default; any activity button may opt in — the vocabulary itself stays hardoded, see the migration's own judgment-call note). */
export function displayButtonQuickLogSleepQuality(key: DisplayButtonKey): boolean {
  const button = findButton(key)
  return !!(button && 'quickLogSleepQuality' in button && button.quickLogSleepQuality)
}

/** Whether this button offers its `'secondary'` note field (was `quickLogDreamsNote`, Sleep-only by default). */
export function displayButtonQuickLogDreamsNote(key: DisplayButtonKey): boolean {
  return displayButtonNoteFields(key).some((field) => field.key === 'secondary')
}

/** Whether this button's value is a per-user server row (`public.daily_values`), local-first with a background sync — currently every day-value button (Steps, Protein). */
export function displayButtonSynced(key: DisplayButtonKey): boolean {
  const button = findButton(key)
  return !!(button && 'synced' in button && button.synced)
}

/** The fixed daily target for a `unit: 'target'` button, or `null` for anything else. */
export function displayButtonTarget(key: DisplayButtonKey): number | null {
  const button = findButton(key)
  return (button && 'target' in button ? button.target : null) ?? null
}

/**
 * Worship's `'songCount'` entry mode computes duration as `count ×
 * WORSHIP_MINUTES_PER_SONG` instead of taking a typed End time — a
 * deliberate, confirmed product number (3 minutes/song), not user-configurable
 * and not to be revisited without a new product decision.
 */
export const WORSHIP_MINUTES_PER_SONG = 3

/** A song count → the duration it logs, per `WORSHIP_MINUTES_PER_SONG`. `null` for anything that isn't a positive whole number of songs. */
export function songCountToMinutes(count: number | null): number | null {
  if (count === null || !Number.isInteger(count) || count <= 0) return null
  return count * WORSHIP_MINUTES_PER_SONG
}

/** `75` minutes → `"1h 15m"`, `40` → `"40m"`, `120` → `"2h"`. */
function formatMinutesValue(value: number): string {
  const h = Math.floor(value / 60)
  const m = value % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

/**
 * A plain count, abbreviated once it passes 999: `1000` → `"1k"`, `1100` →
 * `"1.1k"`, `12300` → `"12.3k"`, `250000` → `"250k"`. Below 1000 it stays a
 * grouped integer (`"840"`).
 */
function formatCountValue(value: number): string {
  if (value < 1000) return value.toLocaleString()
  const thousands = Math.round(value / 100) / 10
  const text = Number.isInteger(thousands) ? thousands.toFixed(0) : thousands.toFixed(1)
  return `${text}k`
}

/**
 * A count against a fixed daily target — `formatTargetRelativeValue(45, 80)`
 * → `"45/80"`. Generalized (takes any value/target pair) so a future
 * target-based button can reuse it without duplicating this shape; not
 * Protein-specific. Unlike `formatDisplayValue`'s em-dash "nothing logged"
 * convention, a progress-style format always shows the target even at zero
 * — `"0/80"` reads as real progress information, "—/80" does not.
 */
export function formatTargetRelativeValue(value: number | null, target: number): string {
  return `${value ?? 0}/${target}`
}

/**
 * The face value: an em dash when nothing has been logged for the viewed day
 * (`unit: 'target'` excepted — see `formatTargetRelativeValue`), a compact
 * duration for `min` buttons, an abbreviated count for `int` buttons.
 */
export function formatDisplayValue(key: DisplayButtonKey, value: number | null): string {
  const unit = displayButtonUnit(key)
  if (unit === 'target') return formatTargetRelativeValue(value, displayButtonTarget(key) ?? 0)
  if (value === null) return '—'
  return unit === 'min' ? formatMinutesValue(value) : formatCountValue(value)
}

/** Parses the editor input to a non-negative integer, or `null` for blank/invalid. */
export function parseDisplayValue(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  if (!/^\d+$/.test(trimmed)) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}
