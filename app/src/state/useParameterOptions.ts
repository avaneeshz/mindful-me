import { useCallback, useEffect, useRef, useState } from 'react'
import {
  apiCreateParameterOption,
  apiDeleteParameterOption,
  apiListEffectiveParameterOptions,
  apiListParameterOptions,
  apiProvisionDefaultParameterOptions,
  apiResetParameterOptionsToInherited,
  apiUpdateParameterOption,
  type ParameterOptionDto,
  type ParameterType,
} from '@/api/parameterOptions'
import { FLAGS, QUALITIES, SYMPTOMS } from '@/data/activities'
import { generateId } from '@/domain/scheduling'
import { supabaseConfigured } from '@/lib/supabaseClient'

export type ParameterOptionsStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface EffectiveOption {
  label: string
  iconKey: string | null
}

export interface UseParameterOptionsResult {
  /** This node's OWN rows per type — non-empty for a type means this node overrides inheritance for it. */
  own: Record<ParameterType, ParameterOptionDto[]>
  /** The resolved list a picker would actually show — this node's own rows if any, else inherited, else the fallback default. */
  effective: Record<ParameterType, EffectiveOption[]>
  /** Whether `effective[type]` is this node's OWN list (`false` means it's inherited/fallback — the UI's cue for "reset to inherited" being meaningful). */
  isOverridden: Record<ParameterType, boolean>
  status: ParameterOptionsStatus
  error: string | null
  addOption: (type: ParameterType, label: string) => void
  renameOption: (id: string, type: ParameterType, label: string) => void
  deleteOption: (id: string, type: ParameterType) => Promise<{ ok: true } | { ok: false; reason: 'has_history' | 'unreachable' }>
  resetToInherited: (type: ParameterType) => Promise<void>
}

const EMPTY_BY_TYPE = <T,>(): Record<ParameterType, T[]> => ({ quality: [], symptom: [], flag: [] })

/** The current 18/6/14 defaults, read-only preview with zero backend configured — mirrors `useTiles`/`useActivityHierarchy`'s own local-only fallback. */
function localOnlyEffective(): Record<ParameterType, EffectiveOption[]> {
  return {
    quality: QUALITIES.map((q) => ({ label: q.id, iconKey: null })),
    symptom: SYMPTOMS.map((s) => ({ label: s.id, iconKey: null })),
    flag: FLAGS.map((f) => ({ label: f.id, iconKey: null })),
  }
}

/**
 * A single activity/sub-activity node's (or, with `activityId: null`, this
 * user's fallback default's) quality/symptom/flag option lists — both what
 * it OWNS directly and what it EFFECTIVELY shows once inheritance resolves
 * (`internal.effective_parameter_options`, see that function's own doc
 * comment for the inheritance rule). Re-fetches whenever `activityId`
 * changes, since this is a per-node view, not one global list.
 */
export function useParameterOptions(activityId: string | null): UseParameterOptionsResult {
  const [own, setOwn] = useState<Record<ParameterType, ParameterOptionDto[]>>(EMPTY_BY_TYPE)
  const [effective, setEffective] = useState<Record<ParameterType, EffectiveOption[]>>(() =>
    supabaseConfigured ? EMPTY_BY_TYPE() : localOnlyEffective(),
  )
  const [status, setStatus] = useState<ParameterOptionsStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const provisionedRef = useRef(false)

  const load = useCallback(async (cancelledRef: { current: boolean }) => {
    if (!supabaseConfigured) {
      setStatus('ready')
      return
    }
    setStatus('loading')

    const [ownRows, quality, symptom, flag] = await Promise.all([
      apiListParameterOptions(activityId),
      apiListEffectiveParameterOptions(activityId, 'quality'),
      apiListEffectiveParameterOptions(activityId, 'symptom'),
      apiListEffectiveParameterOptions(activityId, 'flag'),
    ])
    if (cancelledRef.current) return

    // Genuinely empty everywhere (own AND every effective list, at the
    // fallback level) means this user has never been provisioned — bootstrap
    // once, then reload. A specific activity legitimately having zero own
    // rows is normal (inheritance) and must never re-trigger provisioning.
    const allEmpty =
      !provisionedRef.current &&
      activityId === null &&
      (ownRows?.length ?? 0) === 0 &&
      (quality?.length ?? 0) === 0 &&
      (symptom?.length ?? 0) === 0 &&
      (flag?.length ?? 0) === 0
    if (allEmpty) {
      provisionedRef.current = true
      const provisioned = await apiProvisionDefaultParameterOptions()
      if (cancelledRef.current) return
      if (provisioned) {
        await load(cancelledRef)
        return
      }
    }

    if (ownRows === null || quality === null || symptom === null || flag === null) {
      setStatus('error')
      setError('Could not load these options right now.')
      return
    }

    setOwn({
      quality: ownRows.filter((r) => r.parameterType === 'quality'),
      symptom: ownRows.filter((r) => r.parameterType === 'symptom'),
      flag: ownRows.filter((r) => r.parameterType === 'flag'),
    })
    setEffective({ quality, symptom, flag })
    setStatus('ready')
  }, [activityId])

  useEffect(() => {
    const cancelledRef = { current: false }
    void load(cancelledRef)
    return () => {
      cancelledRef.current = true
    }
  }, [load])

  const addOption = useCallback(
    (type: ParameterType, label: string): void => {
      const trimmed = label.trim()
      if (trimmed === '') return
      const id = generateId()
      const siblingCount = own[type].length
      const created: ParameterOptionDto = {
        id,
        activityId,
        parameterType: type,
        label: trimmed,
        iconKey: null,
        sortOrder: siblingCount,
      }
      setOwn((prev) => ({ ...prev, [type]: [...prev[type], created] }))
      setEffective((prev) => ({
        ...prev,
        [type]: siblingCount === 0 ? [{ label: trimmed, iconKey: null }] : [...prev[type], { label: trimmed, iconKey: null }],
      }))
      if (supabaseConfigured) {
        void apiCreateParameterOption({ id, parameterType: type, label: trimmed, activityId }).then((serverId) => {
          if (serverId === null) setError('Saved on this device — will sync once you’re back online.')
        })
      }
    },
    [activityId, own],
  )

  const renameOption = useCallback(
    (id: string, type: ParameterType, label: string): void => {
      const trimmed = label.trim()
      if (trimmed === '') return
      const previousLabel = own[type].find((o) => o.id === id)?.label
      setOwn((prev) => ({ ...prev, [type]: prev[type].map((o) => (o.id === id ? { ...o, label: trimmed } : o)) }))
      // `effective[type]` only reflects this node's own rows when it's
      // actually overridden (`own[type].length > 0`) — otherwise it's an
      // inherited/fallback list this rename doesn't touch at all.
      if (previousLabel !== undefined && own[type].length > 0) {
        setEffective((prev) => ({
          ...prev,
          [type]: prev[type].map((o) => (o.label === previousLabel ? { ...o, label: trimmed } : o)),
        }))
      }
      if (supabaseConfigured) {
        void apiUpdateParameterOption(id, trimmed).then((ok) => {
          if (!ok) setError('Saved on this device — will sync once you’re back online.')
        })
      }
    },
    [own],
  )

  const deleteOption = useCallback(
    async (id: string, type: ParameterType): Promise<{ ok: true } | { ok: false; reason: 'has_history' | 'unreachable' }> => {
      const target = own[type].find((o) => o.id === id)
      function removeLocally(): void {
        setOwn((prev) => ({ ...prev, [type]: prev[type].filter((o) => o.id !== id) }))
        if (target) setEffective((prev) => ({ ...prev, [type]: prev[type].filter((o) => o.label !== target.label) }))
      }
      // Zero backend configured (rule 6): `addOption`/`renameOption` above
      // already update local state unconditionally — delete used to be the
      // one exception here, returning an `'unreachable'` error that implied
      // a transient problem a retry could fix, when in this mode it never
      // can (found in review, same pattern as `useTiles`/
      // `useActivityHierarchy`'s own `deleteTile`/`deleteActivity`).
      if (!supabaseConfigured) {
        removeLocally()
        return { ok: true }
      }
      const result = await apiDeleteParameterOption(id)
      if (result.ok) removeLocally()
      return result
    },
    [own],
  )

  const resetToInherited = useCallback(
    async (type: ParameterType): Promise<void> => {
      if (!supabaseConfigured || activityId === null) return
      const result = await apiResetParameterOptionsToInherited(activityId, type)
      if (!result.ok) {
        setError('Could not reset this list right now.')
        return
      }
      const cancelledRef = { current: false }
      await load(cancelledRef)
    },
    [activityId, load],
  )

  const isOverridden: Record<ParameterType, boolean> = {
    quality: own.quality.length > 0,
    symptom: own.symptom.length > 0,
    flag: own.flag.length > 0,
  }

  return { own, effective, isOverridden, status, error, addOption, renameOption, deleteOption, resetToInherited }
}
