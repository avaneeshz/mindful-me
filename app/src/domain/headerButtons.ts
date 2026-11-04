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
import { resolveNoteFields } from '@/domain/activityNoteFields'
import { GIFT_TYPES, LEARNING_TYPES } from '@/domain/notes'
import { SUPPLEMENT_ITEMS } from '@/domain/supplements'

export const HEADER_BUTTON_CATEGORIES = ['activity', 'checklist', 'notes', 'day_value'] as const
export type HeaderButtonCategory = (typeof HEADER_BUTTON_CATEGORIES)[number]

export function headerButtonCategoryLabel(category: HeaderButtonCategory): string {
  switch (category) {
    case 'activity':
      return 'Quick activity'
    case 'checklist':
      return 'Checklist'
    case 'notes':
      return 'Content entry'
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
  /** The user's own category this button sits in. `null` until the server assigns one — shown in the first category. */
  groupId: string | null
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
    groupId: null,
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
  group_id?: string | null
}

export function headerButtonConfigFromDto(dto: HeaderButtonDto): HeaderButtonConfig {
  return {
    id: dto.id,
    category: dto.category as HeaderButtonCategory,
    key: dto.key,
    label: dto.label,
    hidden: dto.hidden,
    sortOrder: dto.sort_order,
    groupId: dto.group_id ?? null,
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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** True for a real UUID — what the server accepts as an existing note field's id. */
export function isUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

/**
 * The note fields as the server should receive them. A field the screen invented
 * (an activity button with no saved fields gets a placeholder id like
 * `<buttonId>:note-primary`, see `withActivityNotes`) is not an id the server knows,
 * and is not even a valid UUID — sending it makes the whole save fail. Dropping the id
 * tells the server "this is a new field" and it assigns a real one.
 */
export function withServerFieldIds<T extends { id?: string | undefined }>(fields: readonly T[]): T[] {
  return fields.map((field) => (isUuid(field.id) ? field : { ...field, id: undefined }))
}

/**
 * The activity row is the single source of truth for an activity's note
 * titles (`domain/activityNoteFields.ts`); an activity-category header
 * button is only a view of it. This returns the button with its text note
 * fields replaced by the activity's — so the quick-log popover shows exactly
 * the notes the tile route shows — while multiselect fields stay the
 * button's own.
 */
export function withActivityNotes(
  button: HeaderButtonConfig,
  own: { noteLabel?: string | null; secondNoteLabel?: string | null } | null | undefined,
): HeaderButtonConfig {
  if (button.category !== 'activity') return button
  const resolved = resolveNoteFields(own, button.noteFields)
  const existing = (key: 'primary' | 'secondary') =>
    button.noteFields.find((f) => f.fieldKind === 'text' && f.key === key)
  const texts: HeaderButtonNoteField[] = [
    { id: existing('primary')?.id ?? `${button.id}:note-primary`, fieldKind: 'text', key: 'primary', label: resolved.primaryLabel ?? 'Note', options: [] },
  ]
  if (resolved.secondaryLabel) {
    texts.push({ id: existing('secondary')?.id ?? `${button.id}:note-secondary`, fieldKind: 'text', key: 'secondary', label: resolved.secondaryLabel, options: [] })
  }
  return { ...button, noteFields: [...texts, ...button.noteFields.filter((f) => f.fieldKind !== 'text')] }
}

/** The activity-level note titles a header-button form's text fields describe. */
export function noteLabelsFromFields(fields: readonly { fieldKind: string; key?: string | null; label: string }[]): {
  first: string | null
  second: string | null
} {
  const label = (key: 'primary' | 'secondary') => fields.find((f) => f.fieldKind === 'text' && f.key === key)?.label.trim() || null
  return { first: label('primary'), second: label('secondary') }
}

/** `ids` with `movedId` moved to `toIndex` (clamped). Unknown ids return the list unchanged. */
export function moveId(ids: readonly string[], movedId: string, toIndex: number): string[] {
  const from = ids.indexOf(movedId)
  if (from === -1) return [...ids]
  const next = ids.filter((id) => id !== movedId)
  const clamped = Math.max(0, Math.min(toIndex, next.length))
  next.splice(clamped, 0, movedId)
  return next
}

// ---------------------------------------------------------------------------
// Categories — the user's own named rows of header buttons.
//
// Any number of them, each holding any mix of the four kinds of button. They
// replace the four fixed rows (one per kind) the header used to have.
// ---------------------------------------------------------------------------

export interface HeaderButtonGroup {
  id: string
  name: string
  sortOrder: number
}

/** The shape `public.list_header_button_groups()` hands back. */
export interface HeaderButtonGroupDto {
  id: string
  name: string
  sort_order: number
}

export function headerButtonGroupFromDto(dto: HeaderButtonGroupDto): HeaderButtonGroup {
  return { id: dto.id, name: dto.name, sortOrder: dto.sort_order }
}

export const MAX_GROUP_NAME_LENGTH = 40

/** Local-only / pre-fetch fallback — the one category everyone starts with. */
export const DEFAULT_GROUP_NAME = 'Buttons'
export const DEFAULT_HEADER_BUTTON_GROUPS: readonly HeaderButtonGroup[] = [
  { id: 'buttons', name: DEFAULT_GROUP_NAME, sortOrder: 0 },
]

export function sortGroups(groups: readonly HeaderButtonGroup[]): HeaderButtonGroup[] {
  return [...groups].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
}

/** `null` when `name` is acceptable as a category name, else the sentence to show the user. */
export function validateGroupName(
  name: string,
  groups: readonly HeaderButtonGroup[],
  exceptId?: string,
): string | null {
  const trimmed = name.trim()
  if (trimmed === '') return 'Give the category a name.'
  if (trimmed.length > MAX_GROUP_NAME_LENGTH) return `Keep it to ${MAX_GROUP_NAME_LENGTH} characters or fewer.`
  const clash = groups.some((g) => g.id !== exceptId && g.name.trim().toLowerCase() === trimmed.toLowerCase())
  return clash ? 'You already have a category with that name.' : null
}

export interface HeaderButtonRow {
  group: HeaderButtonGroup
  buttons: HeaderButtonConfig[]
}

/**
 * The rows to render: every category in the user's order, each with its visible
 * buttons in the user's order. A button whose category is unknown (not yet
 * assigned, or its category was deleted elsewhere) is shown in the first
 * category rather than disappearing.
 */
export function groupHeaderButtons(
  groups: readonly HeaderButtonGroup[],
  visible: readonly HeaderButtonConfig[],
): HeaderButtonRow[] {
  const sorted = sortGroups(groups)
  if (sorted.length === 0) return []
  const known = new Set(sorted.map((g) => g.id))
  const first = sorted[0]!.id
  return sorted.map((group) => ({
    group,
    buttons: visible.filter((b) => (b.groupId && known.has(b.groupId) ? b.groupId : first) === group.id),
  }))
}

/** What a drag or a move commits: which category each visible button now lives in, and their order. */
export interface HeaderButtonLayoutEntry {
  groupId: string
  buttonIds: string[]
}
export type HeaderButtonLayout = HeaderButtonLayoutEntry[]

export function layoutFromRows(rows: readonly HeaderButtonRow[]): HeaderButtonLayout {
  return rows.map((row) => ({ groupId: row.group.id, buttonIds: row.buttons.map((b) => b.id) }))
}

/**
 * The layout after putting one button at `toIndex` (clamped; omitted = the end)
 * of a category — a drag across rows, and, with no index, the tap equivalent
 * ("Move to…"). An unknown category or button returns the layout unchanged.
 */
export function layoutAfterMove(
  layout: HeaderButtonLayout,
  buttonId: string,
  toGroupId: string,
  toIndex: number = Number.POSITIVE_INFINITY,
): HeaderButtonLayout {
  if (!layout.some((entry) => entry.groupId === toGroupId)) return layout
  if (!layout.some((entry) => entry.buttonIds.includes(buttonId))) return layout
  return layout.map((entry) => {
    const without = entry.buttonIds.filter((id) => id !== buttonId)
    if (entry.groupId !== toGroupId) return { ...entry, buttonIds: without }
    const at = Math.max(0, Math.min(toIndex, without.length))
    return { ...entry, buttonIds: [...without.slice(0, at), buttonId, ...without.slice(at)] }
  })
}

/**
 * The layout after putting SEVERAL buttons at `toIndex` (clamped; omitted = the
 * end) of one category, kept in the order they already had. This is the
 * multi-select drag: they travel together and land side by side. Unknown
 * buttons are ignored; an unknown category, or none of the buttons known,
 * returns the layout unchanged.
 */
export function layoutAfterMoveMany(
  layout: HeaderButtonLayout,
  buttonIds: readonly string[],
  toGroupId: string,
  toIndex: number = Number.POSITIVE_INFINITY,
): HeaderButtonLayout {
  if (buttonIds.length === 1) return layoutAfterMove(layout, buttonIds[0]!, toGroupId, toIndex)
  if (!layout.some((entry) => entry.groupId === toGroupId)) return layout
  const moving = new Set(buttonIds)
  const ordered = layout.flatMap((entry) => entry.buttonIds).filter((id) => moving.has(id))
  if (ordered.length === 0) return layout
  return layout.map((entry) => {
    const without = entry.buttonIds.filter((id) => !moving.has(id))
    if (entry.groupId !== toGroupId) return { ...entry, buttonIds: without }
    const at = Math.max(0, Math.min(toIndex, without.length))
    return { ...entry, buttonIds: [...without.slice(0, at), ...ordered, ...without.slice(at)] }
  })
}

export function layoutsEqual(a: HeaderButtonLayout, b: HeaderButtonLayout): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** `buttons` with each laid-out button's category and position applied; buttons not in the layout (hidden ones) are untouched. */
export function applyLayout(buttons: readonly HeaderButtonConfig[], layout: HeaderButtonLayout): HeaderButtonConfig[] {
  const placement = new Map<string, { groupId: string; position: number }>()
  let position = 0
  for (const entry of layout) {
    for (const id of entry.buttonIds) placement.set(id, { groupId: entry.groupId, position: position++ })
  }
  return buttons.map((b) => {
    const at = placement.get(b.id)
    return at ? { ...b, groupId: at.groupId, sortOrder: at.position } : b
  })
}

/** After deleting a category: every button in it (hidden ones too) moves to `toGroupId`. */
export function reassignGroup(
  buttons: readonly HeaderButtonConfig[],
  fromGroupId: string,
  toGroupId: string,
): HeaderButtonConfig[] {
  return buttons.map((b) => (b.groupId === fromGroupId ? { ...b, groupId: toGroupId } : b))
}
