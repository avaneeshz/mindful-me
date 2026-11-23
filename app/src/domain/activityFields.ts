import type { ActivityRow } from '@/domain/pickerHierarchy'

/**
 * Per-activity custom fields: any number of titled text notes and any number of
 * multiple-select fields (each with its own options) on a TOP-LEVEL activity.
 * Subtypes use their parent's fields. Pure — no React, no storage — and the
 * database enforces the same rules (`20261126070000_activity_field_rpcs.sql`);
 * this is the client-side mirror so the screen can say so before a round trip.
 *
 * Hiding, never deleting, is how a field or option leaves new logs: past
 * entries keep their values, and a hidden field or option can be restored.
 */
export const MAX_FIELD_LABEL_LENGTH = 60
export const MAX_NOTE_TEXT_LENGTH = 20000

export type ActivityFieldKind = 'text' | 'multiselect'

/** The five fields that existed before custom fields; `null` for any a user adds. */
export type StandardFieldKey = 'note_primary' | 'note_secondary' | 'quality' | 'symptom' | 'flag'

export interface ActivityFieldOption {
  id: string
  label: string
  sortOrder: number
  hidden: boolean
}

export interface ActivityField {
  id: string
  /** The top-level activity that owns the field. */
  activityId: string
  kind: ActivityFieldKind
  label: string
  sortOrder: number
  hidden: boolean
  legacyKey: StandardFieldKey | null
  /** Empty for a text field. */
  options: ActivityFieldOption[]
}

/** What one logged activity holds for one field: a note's text, or a multiple-select field's chosen labels. */
export interface FieldValue {
  text: string | null
  labels: string[]
}

/** A logged activity's values, keyed by field id. */
export type FieldValues = Record<string, FieldValue>

/** The first problem with a field or option title in plain words, or null when it is fine to save. */
export function validateFieldLabel(label: string, noun: 'field' | 'option' | 'note' = 'field'): string | null {
  const trimmed = label.trim()
  if (trimmed === '') return `Give this ${noun} a title.`
  if (trimmed.length > MAX_FIELD_LABEL_LENGTH) return `Keep the title under ${MAX_FIELD_LABEL_LENGTH} characters.`
  return null
}

const sameLabel = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase()

/** Whether `label` is already used by another field on this activity (hidden ones count — they come back when restored). */
export function isFieldLabelTaken(fields: readonly ActivityField[], activityId: string, label: string, exceptId?: string): boolean {
  return fields.some((f) => f.activityId === activityId && f.id !== exceptId && sameLabel(f.label, label))
}

/** Whether `label` is already an option of this field (hidden ones count). */
export function isOptionLabelTaken(field: Pick<ActivityField, 'options'>, label: string, exceptId?: string): boolean {
  return field.options.some((o) => o.id !== exceptId && sameLabel(o.label, label))
}

/** The top-level ancestor of `activityId` — where its fields live. Unknown ids resolve to themselves. */
export function rootActivityId(rows: readonly Pick<ActivityRow, 'id' | 'parentId'>[], activityId: string): string {
  const byId = new Map(rows.map((r) => [r.id, r]))
  let current = activityId
  const seen = new Set<string>()
  for (;;) {
    const parent = byId.get(current)?.parentId
    if (!parent || seen.has(parent)) return current
    seen.add(current)
    current = parent
  }
}

const bySort = <T extends { sortOrder: number; label: string }>(a: T, b: T): number => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)

/** The fields shown when editing or logging `activityId` (a subtype resolves to its parent's), in order. Hidden ones only with `includeHidden`. */
export function fieldsForActivity(
  fields: readonly ActivityField[],
  rows: readonly Pick<ActivityRow, 'id' | 'parentId'>[],
  activityId: string,
  { includeHidden = false }: { includeHidden?: boolean } = {},
): ActivityField[] {
  const root = rootActivityId(rows, activityId)
  return fields
    .filter((f) => f.activityId === root && (includeHidden || !f.hidden))
    .map((f) => ({ ...f, options: [...f.options].sort(bySort) }))
    .sort(bySort)
}

/** A multiple-select field's pickable options, in order — hidden ones left out. */
export function visibleOptions(field: Pick<ActivityField, 'options'>): ActivityFieldOption[] {
  return field.options.filter((o) => !o.hidden).sort(bySort)
}

/**
 * The fields to offer while logging `activityId`, or `undefined` when the activity has none at all
 * (not loaded yet, or a brand-new activity the server hasn't set up) — the caller then falls back
 * to the original fixed form rather than showing an empty one. An activity whose fields are ALL
 * hidden returns `[]`: that is a choice the user made, not a gap.
 */
export function loggableFields(
  fields: readonly ActivityField[],
  rows: readonly Pick<ActivityRow, 'id' | 'parentId'>[],
  activityId: string,
): ActivityField[] | undefined {
  const all = fieldsForActivity(fields, rows, activityId, { includeHidden: true })
  if (all.length === 0) return undefined
  return all.filter((f) => !f.hidden)
}

export function emptyFieldValue(): FieldValue {
  return { text: null, labels: [] }
}

export function isFieldValueEmpty(value: FieldValue | undefined): boolean {
  return !value || ((value.text ?? '').trim() === '' && value.labels.length === 0)
}

/** Sets or clears a note's text, dropping the entry when it ends up empty. */
export function withText(values: FieldValues, fieldId: string, text: string): FieldValues {
  const next = { ...values }
  if (text.trim() === '') delete next[fieldId]
  else next[fieldId] = { text, labels: [] }
  return next
}

/** Adds or removes one option label from a multiple-select field's selection, dropping the entry when it ends up empty. */
export function withToggledLabel(values: FieldValues, fieldId: string, label: string): FieldValues {
  const current = values[fieldId]?.labels ?? []
  const labels = current.includes(label) ? current.filter((l) => l !== label) : [...current, label]
  const next = { ...values }
  if (labels.length === 0) delete next[fieldId]
  else next[fieldId] = { text: null, labels }
  return next
}

/** Only non-empty values for fields that exist — the shape sent to the server (`set_scheduled_activity_field_values`). */
export function normalizeFieldValues(values: FieldValues, fields: readonly Pick<ActivityField, 'id' | 'kind'>[]): FieldValues {
  const kinds = new Map(fields.map((f) => [f.id, f.kind]))
  const out: FieldValues = {}
  for (const [id, value] of Object.entries(values)) {
    const kind = kinds.get(id)
    if (!kind) continue
    if (kind === 'text') {
      const text = (value.text ?? '').trim()
      if (text !== '') out[id] = { text: value.text!, labels: [] }
    } else if (value.labels.length > 0) {
      out[id] = { text: null, labels: [...new Set(value.labels)] }
    }
  }
  return out
}

/** Moves `id` one step in `orderedIds`; null at the ends. The tap alternative to dragging. */
export function moveId(orderedIds: readonly string[], id: string, direction: -1 | 1): string[] | null {
  const index = orderedIds.indexOf(id)
  const target = index + direction
  if (index < 0 || target < 0 || target >= orderedIds.length) return null
  const next = [...orderedIds]
  ;[next[index], next[target]] = [next[target]!, next[index]!]
  return next
}
