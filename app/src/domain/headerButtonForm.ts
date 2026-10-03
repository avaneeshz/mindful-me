import type { CreateHeaderButtonInput, HeaderButtonNoteFieldInput, UpdateHeaderButtonInput } from '@/api/headerButtons'
import { isBlank, type HeaderButtonCategory, type HeaderButtonConfig } from './headerButtons'

/**
 * The add/edit-a-header-button form's rules, independent of any UI — shared
 * by Classic's `HeaderButtonFormDialog` and Lumen's header-button editor so
 * the two can never disagree about what a valid button is or what gets
 * saved. Moved out of `HeaderButtonEditor.tsx` unchanged.
 */

/** The max number of `'text'`-kind fields a button may carry — the physical
 * column limit (`scheduled_activities.notes_encrypted`/`dreams_encrypted`),
 * see `domain/headerButtons.ts`'s own doc comment. `'multiselect'` fields
 * are never capped (proper child-table storage). */
export const MAX_TEXT_FIELDS = 2

/** One field row's in-progress local shape — `id` is present only for a
 * field that already exists on the server (carried through unchanged so a
 * later edit preserves its `scheduled_activity_field_selections` history);
 * a brand-new field has no `id` yet and the server assigns one on save. */
export interface FieldDraft {
  id?: string
  fieldKind: 'text' | 'multiselect'
  key: 'primary' | 'secondary' | null
  label: string
  options: string[]
}

/** Everything the form edits, as typed. */
export interface HeaderButtonDraft {
  category: HeaderButtonCategory
  label: string
  activityName: string
  quickLogType: boolean
  quickLogTypeLabel: string
  fields: FieldDraft[]
  dayValueUnit: 'min' | 'int' | 'target'
  dayValueTarget: string
  /** One per line. */
  noteTypesText: string
  /** One per line. */
  checklistItemsText: string
}

export function draftFromButton(existing: HeaderButtonConfig | null): HeaderButtonDraft {
  return {
    category: existing?.category ?? 'activity',
    label: existing?.label ?? '',
    activityName: existing?.activityName ?? '',
    quickLogType: existing?.quickLogType ?? false,
    quickLogTypeLabel: existing?.quickLogTypeLabel ?? 'Type',
    fields: (existing?.noteFields ?? []).map((f) => ({
      id: f.id,
      fieldKind: f.fieldKind,
      key: f.key,
      label: f.label,
      options: [...f.options],
    })),
    dayValueUnit: existing?.dayValueUnit ?? 'int',
    dayValueTarget: existing?.dayValueTarget?.toString() ?? '',
    noteTypesText: (existing?.noteTypes ?? []).join('\n'),
    checklistItemsText: (existing?.checklistItems ?? []).map((i) => i.label).join('\n'),
  }
}

export function textFieldCount(fields: readonly FieldDraft[]): number {
  return fields.filter((f) => f.fieldKind === 'text').length
}

/** The kind a new field starts as: text while there's room for one, else multiselect. */
export function defaultNewFieldKind(fields: readonly FieldDraft[]): 'text' | 'multiselect' {
  return textFieldCount(fields) >= MAX_TEXT_FIELDS ? 'multiselect' : 'text'
}

/**
 * Adds one note field, or says why it can't be added. A text field takes
 * the first free slot — `'primary'` (the entry's notes), then
 * `'secondary'` (e.g. Sleep's "Dreams").
 */
export function addNoteField(
  fields: readonly FieldDraft[],
  draft: { kind: 'text' | 'multiselect'; label: string; options: readonly string[] },
): { ok: true; fields: FieldDraft[] } | { ok: false; error: string } {
  if (isBlank(draft.label)) return { ok: false, error: 'Give this field a title.' }
  if (draft.kind === 'text' && textFieldCount(fields) >= MAX_TEXT_FIELDS) {
    return { ok: false, error: `Text notes are limited to ${MAX_TEXT_FIELDS} per button.` }
  }
  const trimmedOptions = draft.options.map((o) => o.trim()).filter((o) => o !== '')
  if (draft.kind === 'multiselect' && trimmedOptions.length === 0) {
    return { ok: false, error: 'Add at least one option.' }
  }
  const key: 'primary' | 'secondary' | null =
    draft.kind === 'text' ? (fields.some((f) => f.key === 'primary') ? 'secondary' : 'primary') : null
  return { ok: true, fields: [...fields, { fieldKind: draft.kind, key, label: draft.label.trim(), options: trimmedOptions }] }
}

/** The first problem with the form, in plain language, or null when it can be saved. */
export function validateHeaderButtonDraft(draft: HeaderButtonDraft, isEdit: boolean): string | null {
  if (isBlank(draft.label)) return 'Give this button a name.'
  if (!isEdit) {
    if (draft.category === 'activity' && isBlank(draft.activityName)) return 'Choose an activity to quick-log.'
    if (draft.category === 'day_value' && draft.dayValueUnit === 'target' && isBlank(draft.dayValueTarget)) {
      return 'Set a daily target.'
    }
    if (draft.category === 'checklist' && isBlank(draft.checklistItemsText)) return 'Add at least one checklist item.'
  }
  if (draft.category === 'day_value' && draft.dayValueUnit === 'target' && isBlank(draft.dayValueTarget)) {
    return 'Set a daily target.'
  }
  return null
}

function lines(text: string): string[] {
  return text
    .split('\n')
    .map((v) => v.trim())
    .filter((v) => v !== '')
}

function noteFieldInputs(draft: HeaderButtonDraft): HeaderButtonNoteFieldInput[] {
  return draft.fields.map((f) => ({
    id: f.id,
    fieldKind: f.fieldKind,
    key: f.key,
    label: f.label,
    options: f.fieldKind === 'multiselect' ? f.options : [],
  }))
}

/** What an edit saves. A checklist keeps each existing item's key by position, so its history stays attached. */
export function toUpdateInput(
  draft: HeaderButtonDraft,
  existing: HeaderButtonConfig,
): UpdateHeaderButtonInput & { category: HeaderButtonCategory } {
  const category = draft.category
  return {
    id: existing.id,
    category,
    label: draft.label.trim(),
    quickLogTypeLabel: category === 'activity' ? draft.quickLogTypeLabel.trim() || 'Type' : null,
    dayValueTarget: category === 'day_value' && draft.dayValueUnit === 'target' ? Number(draft.dayValueTarget) : null,
    noteFields: category === 'activity' ? noteFieldInputs(draft) : null,
    noteTypes: category === 'notes' ? lines(draft.noteTypesText) : null,
    checklistItems:
      category === 'checklist'
        ? lines(draft.checklistItemsText).map((label, index) => ({ key: existing.checklistItems[index]?.key, label }))
        : null,
  }
}

/** What a new button saves. `activityId` is the catalog id of `draft.activityName`, resolved by the caller. */
export function toCreateInput(draft: HeaderButtonDraft, activityId: string | null): Omit<CreateHeaderButtonInput, 'id'> {
  const category = draft.category
  return {
    category,
    label: draft.label.trim(),
    activityId,
    entryMode: 'duration',
    quickLogType: category === 'activity' ? draft.quickLogType : false,
    quickLogTypeLabel: category === 'activity' && draft.quickLogType ? draft.quickLogTypeLabel.trim() || 'Type' : null,
    dayValueUnit: category === 'day_value' ? draft.dayValueUnit : null,
    dayValueTarget: category === 'day_value' && draft.dayValueUnit === 'target' ? Number(draft.dayValueTarget) : null,
    noteFields: category === 'activity' ? noteFieldInputs(draft) : [],
    noteTypes: category === 'notes' ? lines(draft.noteTypesText) : [],
    checklistItems: category === 'checklist' ? lines(draft.checklistItemsText).map((label) => ({ label })) : [],
  }
}

/** Shown wherever a button form lists fields: text notes live on the activity, not the button. */
export const ACTIVITY_NOTES_HINT =
  'Written notes come from the activity itself, so the tile and this button always match. Rename them or add a second one in the activity’s editor.'
