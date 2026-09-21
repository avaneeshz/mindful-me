/**
 * Header-button CUSTOMIZATION — the unified config shape that replaces the
 * three previously-unrelated hardcoded systems' CONFIGURATION halves
 * (`DISPLAY_BUTTONS` in the old `domain/displayButtons.ts`, `NOTE_BUTTONS` in
 * `domain/notes.ts`, `SupplementsButton.tsx`'s 7-item list). Pure types +
 * derivation only — no React, no Supabase — mirroring how
 * `domain/scheduling.ts` keeps this kind of shared logic component/DB-free.
 * See `20260920060000_header_buttons.sql` for the DB side this maps onto,
 * and `state/useHeaderButtons.ts` for where the local-first cache + server
 * sync live.
 *
 * `domain/displayButtons.ts` and `domain/notes.ts` keep their own pure
 * formatting/lookup helpers (a "day-value" button's face-value formatting,
 * a "notes" button's submit-gating) — those are unchanged, category-specific
 * concerns. This module owns what's genuinely NEW: the four-category config
 * shape itself, the visible/hidden partition, and the DTO mapping to/from
 * `list_header_buttons()`.
 *
 * Every `HeaderButtonConfig` a user has is unconditionally theirs — there is
 * no "shared system default" concept (`created_by` is `NOT NULL` in the DB;
 * see `20260920080000_header_buttons_per_user_ownership.sql`). A brand-new
 * user starts with zero buttons; `state/useHeaderButtons.ts` provisions
 * their own copy of the same default set (`DEFAULT_HEADER_BUTTONS` below)
 * the first time it sees an empty list. Renaming, reconfiguring, or hiding
 * a provisioned button is identical to doing the same to one the user
 * added by hand — no special-casing by origin, anywhere.
 */
import { GIFT_TYPES, LEARNING_TYPES } from '@/domain/notes'
import { SUPPLEMENT_ITEMS } from '@/domain/supplements'

export const HEADER_BUTTON_CATEGORIES = ['activity', 'checklist', 'notes', 'day_value'] as const
export type HeaderButtonCategory = (typeof HEADER_BUTTON_CATEGORIES)[number]

export function headerButtonCategoryLabel(category: HeaderButtonCategory): string {
  switch (category) {
    case 'activity':
      return 'Quick-log an activity'
    case 'checklist':
      return 'Checklist'
    case 'notes':
      return 'Freeform note'
    case 'day_value':
      return 'Daily number'
  }
}

/**
 * Generalizes Sleep's old hardcoded `quickLogNote`/`quickLogDreamsNote`
 * booleans AND its old hardcoded `quickLogSleepQuality` "How was your
 * sleep?" special case into ONE mechanism, two kinds:
 *   - `'text'` — bounded to two slots (`key: 'primary'|'secondary'`)
 *     because that's genuinely all the physical storage
 *     `scheduled_activities` has for a note-shaped value
 *     (`notes_encrypted`, `dreams_encrypted`) — see the migration's own doc
 *     comment for the full reasoning.
 *   - `'multiselect'` — NOT capped (any number of fields, each with any
 *     number of user-defined `options`), since it's backed by its own child
 *     tables (`header_button_field_options` /
 *     `scheduled_activity_field_selections`), not a fixed column. `id` is
 *     this field's stable identity — the same value
 *     `scheduled_activity_field_selections.note_field_id` keys selections
 *     by, so it must be preserved across an edit (see
 *     `20260921060000_dynamic_note_fields.sql`'s own judgment-call note on
 *     why `update_header_button` never blindly regenerates it).
 * Any activity-category button can be configured with any mix of these,
 * freely labeled — Sleep keeps its three (Note, Dreams, "How was your
 * sleep?") as ordinary configured fields, no longer a hardcoded special
 * case anywhere in this module.
 */
export interface HeaderButtonNoteField {
  id: string
  fieldKind: 'text' | 'multiselect'
  /** `'text'` only — which physical column this maps to. `null` for `'multiselect'`. */
  key: 'primary' | 'secondary' | null
  label: string
  /** `'multiselect'` only — this field's own user-defined option list. Empty for `'text'`. */
  options: readonly string[]
}

export interface HeaderButtonChecklistItemConfig {
  /** Stable identity — `supplement_completions.item_key` (server) / the local cache key. Never re-derived from `label`. */
  key: string
  label: string
}

export interface HeaderButtonConfig {
  /** Stable identity for everything — React keys, local-cache keys, and (once synced) `header_buttons.id`. */
  id: string
  category: HeaderButtonCategory
  /** `note_entries.button_key` / `daily_values.metric_key` — 'notes'/'day_value' only, else `null`. */
  key: string | null
  label: string
  /** This user's own hide state (`header_button_user_state`). */
  hidden: boolean
  sortOrder: number
  // --- 'activity' ---
  activityId: string | null
  /** The catalog card name `quickLogName` used to key off — e.g. `'Sports or Exercise'`. */
  activityName: string | null
  entryMode: 'duration' | 'songCount'
  quickLogType: boolean
  quickLogTypeLabel: string
  /** Every configured note field, text and multiselect alike, in the order they're shown. */
  noteFields: HeaderButtonNoteField[]
  // --- 'day_value' ---
  dayValueUnit: 'min' | 'int' | 'target' | null
  dayValueTarget: number | null
  // --- 'notes' ---
  noteTypes: readonly string[]
  // --- 'checklist' ---
  checklistItems: HeaderButtonChecklistItemConfig[]
}

function base(input: {
  id: string
  category: HeaderButtonCategory
  key?: string | null
  label: string
  sortOrder: number
}): HeaderButtonConfig {
  return {
    id: input.id,
    category: input.category,
    key: input.key ?? null,
    label: input.label,
    hidden: false,
    sortOrder: input.sortOrder,
    activityId: null,
    activityName: null,
    entryMode: 'duration',
    quickLogType: false,
    quickLogTypeLabel: 'Type',
    noteFields: [],
    dayValueUnit: null,
    dayValueTarget: null,
    noteTypes: [],
    checklistItems: [],
  }
}

function activityDefault(input: {
  id: string
  activityName: string
  label: string
  sortOrder: number
  entryMode?: 'duration' | 'songCount'
  quickLogType?: boolean
  quickLogTypeLabel?: string
  noteFields?: HeaderButtonNoteField[]
}): HeaderButtonConfig {
  return {
    ...base({ id: input.id, category: 'activity', label: input.label, sortOrder: input.sortOrder }),
    activityId: null,
    activityName: input.activityName,
    entryMode: input.entryMode ?? 'duration',
    quickLogType: input.quickLogType ?? false,
    quickLogTypeLabel: input.quickLogTypeLabel ?? 'Type',
    noteFields: input.noteFields ?? [],
  }
}

/** Shorthand for a `'text'`-kind field in `DEFAULT_HEADER_BUTTONS`. */
function textField(id: string, key: 'primary' | 'secondary', label: string): HeaderButtonNoteField {
  return { id, fieldKind: 'text', key, label, options: [] }
}

/** Shorthand for a `'multiselect'`-kind field in `DEFAULT_HEADER_BUTTONS`. */
function multiselectField(id: string, label: string, options: readonly string[]): HeaderButtonNoteField {
  return { id, fieldKind: 'multiselect', key: null, label, options }
}

/**
 * Sleep's "How was your sleep?" 11 options — the local-only-mode mirror of
 * the same list `provision_default_header_buttons()` seeds server-side.
 * Values only (this module has no vocabulary of its own to keep in sync
 * beyond matching the DB seed) — see `20260921060000_dynamic_note_fields.sql`.
 */
const SLEEP_QUALITY_OPTIONS = [
  'Deep Restorative',
  'Light & Restful',
  'Light & Restless',
  'Fragmented',
  'Interrupted',
  'Long but Unrefreshing',
  'Short but Restorative',
  'Dream-Intense',
  'Delayed',
  'Early Awakening',
  'Unusually Deep',
] as const

function dayValueDefault(input: {
  id: string
  key: string
  label: string
  sortOrder: number
  unit: 'min' | 'int' | 'target'
  target?: number
}): HeaderButtonConfig {
  return {
    ...base({ id: input.id, category: 'day_value', key: input.key, label: input.label, sortOrder: input.sortOrder }),
    dayValueUnit: input.unit,
    dayValueTarget: input.target ?? null,
  }
}

function notesDefault(input: {
  id: string
  key: string
  label: string
  sortOrder: number
  noteTypes?: readonly string[]
}): HeaderButtonConfig {
  return {
    ...base({ id: input.id, category: 'notes', key: input.key, label: input.label, sortOrder: input.sortOrder }),
    noteTypes: input.noteTypes ?? [],
  }
}

function checklistDefault(input: {
  id: string
  label: string
  sortOrder: number
  items: readonly { key: string; label: string }[]
}): HeaderButtonConfig {
  return {
    ...base({ id: input.id, category: 'checklist', label: input.label, sortOrder: input.sortOrder }),
    checklistItems: input.items.map((item) => ({ key: item.key, label: item.label })),
  }
}

/**
 * The local-only / pre-fetch fallback — verbatim the same keys, labels and
 * order as the old `DISPLAY_BUTTONS`/`NOTE_BUTTONS`/`SUPPLEMENT_ITEMS`
 * constants (and the DB seed migration mirrors this exactly, row for row —
 * see that file's own comment). This is what renders instantly with zero
 * backend configured (rule 6), and what a fresh server fetch reconciles
 * against once it answers.
 */
export const DEFAULT_HEADER_BUTTONS: readonly HeaderButtonConfig[] = [
  notesDefault({ id: 'gifts', key: 'gifts', label: 'Extra Senses', sortOrder: 0, noteTypes: GIFT_TYPES }),
  notesDefault({ id: 'learnings', key: 'learnings', label: 'Learnings', sortOrder: 1, noteTypes: LEARNING_TYPES }),
  notesDefault({ id: 'mirror', key: 'mirror', label: 'Relational Nutrient', sortOrder: 2 }),
  notesDefault({ id: 'scriptures', key: 'scriptures', label: 'Scriptures', sortOrder: 3 }),
  activityDefault({ id: 'vipassana', activityName: 'Vipassana', label: 'Vipassana', sortOrder: 4 }),
  dayValueDefault({ id: 'steps', key: 'steps', label: 'Steps', sortOrder: 5, unit: 'int' }),
  activityDefault({
    id: 'exercise',
    activityName: 'Sports or Exercise',
    label: 'Exercise',
    sortOrder: 6,
    quickLogType: true,
    quickLogTypeLabel: 'Type',
    noteFields: [textField('exercise-note', 'primary', 'Note')],
  }),
  activityDefault({
    id: 'breathing',
    activityName: 'Breathwork',
    label: 'Breathing',
    sortOrder: 7,
    quickLogType: true,
    quickLogTypeLabel: 'Type',
    noteFields: [textField('breathing-note', 'primary', 'Note')],
  }),
  activityDefault({
    id: 'sleep',
    activityName: 'Sleep',
    label: 'Sleep',
    sortOrder: 8,
    quickLogType: true,
    quickLogTypeLabel: 'Sleep type',
    noteFields: [
      textField('sleep-note', 'primary', 'Note'),
      textField('sleep-dreams', 'secondary', 'Dreams'),
      multiselectField('sleep-quality', 'How was your sleep?', SLEEP_QUALITY_OPTIONS),
    ],
  }),
  activityDefault({
    id: 'prayer',
    activityName: 'Prayer',
    label: 'Prayer',
    sortOrder: 9,
    quickLogType: true,
    quickLogTypeLabel: 'Type',
    noteFields: [textField('prayer-note', 'primary', 'Note')],
  }),
  activityDefault({
    id: 'sermons',
    activityName: 'Sermons',
    label: 'Sermons',
    sortOrder: 10,
    noteFields: [textField('sermons-note', 'primary', 'Note')],
  }),
  activityDefault({
    id: 'worship',
    activityName: 'Worship',
    label: 'Worship',
    sortOrder: 11,
    entryMode: 'songCount',
    noteFields: [textField('worship-note', 'primary', 'Note')],
  }),
  dayValueDefault({ id: 'protein', key: 'protein', label: 'Protein', sortOrder: 12, unit: 'target', target: 80 }),
  checklistDefault({ id: 'supplements', label: 'Supplements', sortOrder: 13, items: SUPPLEMENT_ITEMS }),
]

/** The shape `public.list_header_buttons()` hands back. */
export interface HeaderButtonDto {
  id: string
  category: string
  key: string | null
  label: string
  sort_order: number
  hidden: boolean
  activity_id: string | null
  activity_name: string | null
  entry_mode: string
  quick_log_type: boolean
  quick_log_type_label: string | null
  day_value_unit: string | null
  day_value_target: number | null
  note_fields: { id: string; fieldKind: string; key: string | null; label: string; options: string[] }[]
  note_types: string[]
  checklist_items: { key: string; label: string }[]
}

export function headerButtonConfigFromDto(dto: HeaderButtonDto): HeaderButtonConfig {
  return {
    id: dto.id,
    category: dto.category as HeaderButtonCategory,
    key: dto.key,
    label: dto.label,
    hidden: dto.hidden,
    sortOrder: dto.sort_order,
    activityId: dto.activity_id,
    activityName: dto.activity_name,
    entryMode: dto.entry_mode === 'song_count' ? 'songCount' : 'duration',
    quickLogType: dto.quick_log_type,
    quickLogTypeLabel: dto.quick_log_type_label ?? 'Type',
    noteFields: (dto.note_fields ?? []).map((f) => ({
      id: f.id,
      fieldKind: f.fieldKind === 'multiselect' ? 'multiselect' : 'text',
      key: f.key as 'primary' | 'secondary' | null,
      label: f.label,
      options: f.options ?? [],
    })),
    dayValueUnit: (dto.day_value_unit as 'min' | 'int' | 'target' | null) ?? null,
    dayValueTarget: dto.day_value_target,
    noteTypes: dto.note_types ?? [],
    checklistItems: dto.checklist_items ?? [],
  }
}

/**
 * This user's effective list, split into what's currently shown and what
 * they've hidden, in their own chosen order — mirrors `list_header_buttons()`'s
 * own ordering exactly so local-only mode and server mode never visibly
 * disagree. Returns BOTH halves (visible + hidden) — a hide is never a dead
 * end; edit mode's own "Hidden" section lists `hidden` so it can be undone.
 */
export function partitionHeaderButtons(
  buttons: readonly HeaderButtonConfig[],
): { visible: HeaderButtonConfig[]; hidden: HeaderButtonConfig[] } {
  const sorted = [...buttons].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
  return {
    visible: sorted.filter((b) => !b.hidden),
    hidden: sorted.filter((b) => b.hidden),
  }
}

/** `"Post-lunch magnesium"` -> `"post_lunch_magnesium"` — mirrors the server's own checklist-item-key slugify exactly (`create_header_button`'s SQL), so a locally-created item's key never disagrees with what the server would have generated for the same label. */
export function slugifyChecklistItemKey(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return slug
}

/** A short random suffix for de-duplicating a checklist item key that collides with one already in the list — same shape the server falls back to. */
export function dedupeChecklistItemKey(key: string, existing: ReadonlySet<string>): string {
  if (!existing.has(key)) return key
  let candidate = key
  let attempt = 0
  while (existing.has(candidate)) {
    attempt += 1
    candidate = `${key}_${attempt}`
  }
  return candidate
}

export function isBlank(value: string): boolean {
  return value.trim() === ''
}

/**
 * Adapts an 'activity' or 'day_value' `HeaderButtonConfig` into the shape
 * `domain/displayButtons.ts`'s registry (`setDisplayButtonsRegistry`)
 * expects — `DisplayValueButton` stays keyed by `config.id` (stable across
 * a rename), while `storageKey` carries the real `daily_values.metric_key`
 * a day-value button actually writes under (irrelevant for an activity
 * button, which writes by NAME through the shared scheduling module
 * exactly as it always has).
 */
export function toDisplayButtonLike(config: HeaderButtonConfig): {
  key: string
  storageKey?: string
  label: string
  unit: 'min' | 'int' | 'target'
  input: 'number' | 'duration' | 'songCount'
  quickLogName?: string
  quickLogType?: boolean
  quickLogTypeLabel?: string
  noteFields?: HeaderButtonNoteField[]
  synced?: boolean
  target?: number
} {
  const isDayValue = config.category === 'day_value'
  return {
    key: config.id,
    storageKey: config.key ?? config.id,
    label: config.label,
    unit: isDayValue ? (config.dayValueUnit ?? 'int') : 'min',
    input: isDayValue ? 'number' : config.entryMode === 'songCount' ? 'songCount' : 'duration',
    quickLogName: config.category === 'activity' ? (config.activityName ?? undefined) : undefined,
    quickLogType: config.quickLogType,
    quickLogTypeLabel: config.quickLogTypeLabel,
    noteFields: config.noteFields,
    synced: isDayValue,
    target: config.dayValueTarget ?? undefined,
  }
}
