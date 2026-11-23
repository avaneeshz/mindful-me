import { useCallback, useEffect, useRef, useState } from 'react'
import { apiListActivityFields } from '@/api/activityFields'
import {
  isFieldLabelTaken,
  isOptionLabelTaken,
  validateFieldLabel,
  type ActivityField,
  type ActivityFieldKind,
  type StandardFieldKey,
} from '@/domain/activityFields'
import { reconcileList } from '@/domain/reconcileList'
import { generateId } from '@/domain/scheduling'
import type { ActivityRow } from '@/domain/pickerHierarchy'
import { supabaseConfigured } from '@/lib/supabaseClient'
import { localOnlyVocabulary } from './parameterOptionsLocalOnly'
import { getPendingIds, writeThrough } from './pendingWrites'

export type ActivityFieldsStatus = 'idle' | 'loading' | 'ready' | 'error'

/** `ok: false` carries a sentence for the screen — nothing was changed. */
export type FieldEditResult<T = undefined> = ({ ok: true } & (T extends undefined ? object : { value: T })) | { ok: false; message: string }

export interface UseActivityFieldsResult {
  /** Every field (hidden included) on every top-level activity, with options. Use `fieldsForActivity` to pick one activity's. */
  fields: ActivityField[]
  status: ActivityFieldsStatus
  error: string | null
  addField: (activityId: string, kind: ActivityFieldKind, label: string) => FieldEditResult<ActivityField>
  renameField: (id: string, label: string) => FieldEditResult
  setFieldHidden: (id: string, hidden: boolean) => void
  reorderFields: (activityId: string, orderedIds: string[]) => void
  addOption: (fieldId: string, label: string) => FieldEditResult
  renameOption: (fieldId: string, optionId: string, label: string) => FieldEditResult
  setOptionHidden: (fieldId: string, optionId: string, hidden: boolean) => void
  reorderOptions: (fieldId: string, orderedIds: string[]) => void
}

const STANDARD_TITLES: Record<Exclude<StandardFieldKey, 'note_primary' | 'note_secondary'>, string> = {
  quality: 'Activity quality',
  symptom: 'Chronic symptoms',
  flag: 'Protective response',
}

/**
 * Zero-backend preview (rule 6): the same standard fields the database seeds
 * for every top-level activity (its note(s) plus quality / symptoms /
 * protective response, carrying the built-in default options), in memory
 * only. Nothing here persists; a reload starts from the defaults again.
 */
function localStandardFields(rows: readonly ActivityRow[]): ActivityField[] {
  const vocabulary = localOnlyVocabulary()
  const out: ActivityField[] = []
  for (const row of rows) {
    if (row.parentId !== null) continue
    const note = (key: StandardFieldKey, label: string, sortOrder: number): ActivityField => ({
      id: `local:${row.id}:${key}`,
      activityId: row.id,
      kind: 'text',
      label,
      sortOrder,
      hidden: false,
      legacyKey: key,
      options: [],
    })
    out.push(note('note_primary', row.noteLabel?.trim() || 'Notes', 0))
    if (row.secondNoteLabel?.trim()) out.push(note('note_secondary', row.secondNoteLabel.trim(), 1))
    ;(['quality', 'symptom', 'flag'] as const).forEach((type, index) => {
      out.push({
        id: `local:${row.id}:${type}`,
        activityId: row.id,
        kind: 'multiselect',
        label: STANDARD_TITLES[type],
        sortOrder: 2 + index,
        hidden: false,
        legacyKey: type,
        options: vocabulary[type].map((o, i) => ({ id: `${row.id}:${o.id}`, label: o.label, sortOrder: i, hidden: false })),
      })
    })
  }
  return out
}

const SAVED_LOCALLY = 'Saved on this device — will sync once you’re back online.'

/**
 * Every activity's custom fields: fetched from the server, optimistic local
 * updates on every change, each change written through the durable queue
 * (`pendingWrites`) so a failed send is retried rather than lost. Same shape as
 * `useTiles` / `useActivityHierarchy`. `activities` is only used to seed the
 * zero-backend preview.
 */
export function useActivityFields(activities: readonly ActivityRow[] = []): UseActivityFieldsResult {
  const [fields, setFields] = useState<ActivityField[]>([])
  const [status, setStatus] = useState<ActivityFieldsStatus>(supabaseConfigured ? 'idle' : 'ready')
  const [error, setError] = useState<string | null>(null)
  const hasFetchedRef = useRef(false)
  const fieldsRef = useRef(fields)
  fieldsRef.current = fields

  // Zero backend: seed the standard fields for each top-level activity as it appears.
  useEffect(() => {
    if (supabaseConfigured) return
    setFields((prev) => {
      const known = new Set(prev.map((f) => f.activityId))
      const fresh = localStandardFields(activities.filter((a) => !known.has(a.id)))
      return fresh.length === 0 ? prev : [...prev, ...fresh]
    })
  }, [activities])

  useEffect(() => {
    if (hasFetchedRef.current || !supabaseConfigured) return
    hasFetchedRef.current = true
    let cancelled = false
    setStatus('loading')
    void (async () => {
      const server = await apiListActivityFields()
      if (cancelled) return
      if (server === null) {
        setStatus('error')
        setError('Could not load your fields right now.')
        return
      }
      // Never let the server's list erase a change it hasn't confirmed yet.
      const pendingFields = getPendingIds('activityField')
      const pendingOptions = getPendingIds('activityFieldOption')
      setFields((prev) => {
        const localById = new Map(prev.map((f) => [f.id, f]))
        return reconcileList(prev, server, pendingFields.save, pendingFields.delete, (f) => f.id).map((f) => {
          const local = localById.get(f.id)
          if (!local) return f
          return { ...f, options: reconcileList(local.options, f.options, pendingOptions.save, pendingOptions.delete, (o) => o.id) }
        })
      })
      setStatus('ready')
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const send = useCallback(
    (spec: Parameters<typeof writeThrough>[0], onRejected: () => void): void => {
      if (!supabaseConfigured) return
      void writeThrough(spec).then((out) => {
        if (out.status === 'queued') setError(SAVED_LOCALLY)
        if (out.status === 'rejected') {
          onRejected()
          setError('That title is already in use here.')
        }
      })
    },
    [],
  )

  const patchField = (id: string, patch: (f: ActivityField) => ActivityField) =>
    setFields((prev) => prev.map((f) => (f.id === id ? patch(f) : f)))

  const addField: UseActivityFieldsResult['addField'] = useCallback(
    (activityId, kind, label) => {
      const problem = validateFieldLabel(label, kind === 'text' ? 'note' : 'field')
      if (problem) return { ok: false, message: problem }
      if (isFieldLabelTaken(fieldsRef.current, activityId, label)) {
        return { ok: false, message: `You already have a note or field called “${label.trim()}” here. Pick a different title.` }
      }
      const id = generateId()
      const siblings = fieldsRef.current.filter((f) => f.activityId === activityId)
      const field: ActivityField = {
        id,
        activityId,
        kind,
        label: label.trim(),
        sortOrder: siblings.reduce((max, f) => Math.max(max, f.sortOrder), -1) + 1,
        hidden: false,
        legacyKey: null,
        options: [],
      }
      setFields((prev) => [...prev, field])
      send(
        { action: 'activityField.create', entity: 'activityField', recordId: id, op: 'save', args: [id, activityId, kind, field.label], label: `Add ${kind === 'text' ? 'note' : 'field'} “${field.label}”` },
        () => setFields((prev) => prev.filter((f) => f.id !== id)),
      )
      return { ok: true, value: field }
    },
    [send],
  )

  const renameField: UseActivityFieldsResult['renameField'] = useCallback(
    (id, label) => {
      const current = fieldsRef.current.find((f) => f.id === id)
      if (!current) return { ok: false, message: 'That field no longer exists.' }
      const problem = validateFieldLabel(label, current.kind === 'text' ? 'note' : 'field')
      if (problem) return { ok: false, message: problem }
      if (isFieldLabelTaken(fieldsRef.current, current.activityId, label, id)) {
        return { ok: false, message: `You already have a note or field called “${label.trim()}” here. Pick a different title.` }
      }
      const previous = current.label
      patchField(id, (f) => ({ ...f, label: label.trim() }))
      send(
        { action: 'activityField.rename', entity: 'activityField', recordId: id, op: 'save', args: [id, label.trim()], label: `Rename “${previous}” to “${label.trim()}”` },
        () => patchField(id, (f) => ({ ...f, label: previous })),
      )
      return { ok: true }
    },
    [send],
  )

  const setFieldHidden = useCallback(
    (id: string, hidden: boolean): void => {
      patchField(id, (f) => ({ ...f, hidden }))
      send(
        { action: 'activityField.setHidden', entity: 'activityField', recordId: id, op: 'save', args: [id, hidden], label: `${hidden ? 'Hide' : 'Restore'} a field`, coalesce: true },
        () => patchField(id, (f) => ({ ...f, hidden: !hidden })),
      )
    },
    [send],
  )

  const reorderFields = useCallback(
    (activityId: string, orderedIds: string[]): void => {
      const index = new Map(orderedIds.map((id, i) => [id, i]))
      setFields((prev) => prev.map((f) => (f.activityId === activityId && index.has(f.id) ? { ...f, sortOrder: index.get(f.id)! } : f)))
      send(
        { action: 'activityField.reorder', entity: 'activityField', recordId: `order:${activityId}`, op: 'save', args: [activityId, orderedIds], label: 'Reorder fields', coalesce: true },
        () => undefined,
      )
    },
    [send],
  )

  const patchOptions = (fieldId: string, patch: (o: ActivityField['options']) => ActivityField['options']) =>
    patchField(fieldId, (f) => ({ ...f, options: patch(f.options) }))

  const addOption: UseActivityFieldsResult['addOption'] = useCallback(
    (fieldId, label) => {
      const field = fieldsRef.current.find((f) => f.id === fieldId)
      if (!field || field.kind !== 'multiselect') return { ok: false, message: 'Options can only be added to a multiple-select field.' }
      const problem = validateFieldLabel(label, 'option')
      if (problem) return { ok: false, message: problem }
      if (isOptionLabelTaken(field, label)) return { ok: false, message: `“${label.trim()}” is already an option here.` }
      const id = generateId()
      const option = { id, label: label.trim(), sortOrder: field.options.reduce((max, o) => Math.max(max, o.sortOrder), -1) + 1, hidden: false }
      patchOptions(fieldId, (opts) => [...opts, option])
      send(
        { action: 'activityFieldOption.create', entity: 'activityFieldOption', recordId: id, op: 'save', args: [id, fieldId, option.label], label: `Add option “${option.label}”` },
        () => patchOptions(fieldId, (opts) => opts.filter((o) => o.id !== id)),
      )
      return { ok: true }
    },
    [send],
  )

  const renameOption: UseActivityFieldsResult['renameOption'] = useCallback(
    (fieldId, optionId, label) => {
      const field = fieldsRef.current.find((f) => f.id === fieldId)
      const current = field?.options.find((o) => o.id === optionId)
      if (!field || !current) return { ok: false, message: 'That option no longer exists.' }
      const problem = validateFieldLabel(label, 'option')
      if (problem) return { ok: false, message: problem }
      if (isOptionLabelTaken(field, label, optionId)) return { ok: false, message: `“${label.trim()}” is already an option here.` }
      const previous = current.label
      patchOptions(fieldId, (opts) => opts.map((o) => (o.id === optionId ? { ...o, label: label.trim() } : o)))
      send(
        { action: 'activityFieldOption.rename', entity: 'activityFieldOption', recordId: optionId, op: 'save', args: [optionId, label.trim()], label: `Rename option “${previous}”` },
        () => patchOptions(fieldId, (opts) => opts.map((o) => (o.id === optionId ? { ...o, label: previous } : o))),
      )
      return { ok: true }
    },
    [send],
  )

  const setOptionHidden = useCallback(
    (fieldId: string, optionId: string, hidden: boolean): void => {
      patchOptions(fieldId, (opts) => opts.map((o) => (o.id === optionId ? { ...o, hidden } : o)))
      send(
        { action: 'activityFieldOption.setHidden', entity: 'activityFieldOption', recordId: optionId, op: 'save', args: [optionId, hidden], label: `${hidden ? 'Hide' : 'Restore'} an option`, coalesce: true },
        () => patchOptions(fieldId, (opts) => opts.map((o) => (o.id === optionId ? { ...o, hidden: !hidden } : o))),
      )
    },
    [send],
  )

  const reorderOptions = useCallback(
    (fieldId: string, orderedIds: string[]): void => {
      const index = new Map(orderedIds.map((id, i) => [id, i]))
      patchOptions(fieldId, (opts) => opts.map((o) => (index.has(o.id) ? { ...o, sortOrder: index.get(o.id)! } : o)))
      send(
        { action: 'activityFieldOption.reorder', entity: 'activityFieldOption', recordId: `order:${fieldId}`, op: 'save', args: [fieldId, orderedIds], label: 'Reorder options', coalesce: true },
        () => undefined,
      )
    },
    [send],
  )

  return { fields, status, error, addField, renameField, setFieldHidden, reorderFields, addOption, renameOption, setOptionHidden, reorderOptions }
}
