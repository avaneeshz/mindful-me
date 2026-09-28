import { useCallback, useEffect, useRef, useState } from 'react'
import {
  apiListActivityParameterChecklist,
  apiResetActivityParameterSelectionToInherited,
  apiSetActivityParameterSelection,
  type ParameterType,
} from '@/api/parameterOptions'
import { generateId } from '@/domain/scheduling'
import { supabaseConfigured } from '@/lib/supabaseClient'
import {
  notifyParameterOptionsChanged,
  useParameterOptionsInvalidationVersion,
  useParameterVocabularyInvalidationVersion,
} from './parameterOptionsInvalidation'
import { emptyByParameterType, localOnlyVocabulary } from './parameterOptionsLocalOnly'

export type ActivityParameterSelectionsStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface ChecklistOption {
  optionId: string
  label: string
  iconKey: string | null
  selected: boolean
}

export interface UseActivityParameterSelectionsResult {
  byType: Record<ParameterType, ChecklistOption[]>
  /** Whether this activity has ANY own selection rows for this type — `false` means it's inheriting (nearest ancestor, or the full global list). */
  isOwn: Record<ParameterType, boolean>
  status: ActivityParameterSelectionsStatus
  error: string | null
  /** Toggle one option on/off for this activity. First toggle for a purely-inheriting (activity, type) materializes everything it used to inherit, then applies this one change (server-side — see `set_activity_parameter_selection`'s own doc comment). */
  toggle: (type: ParameterType, optionId: string, selected: boolean) => Promise<{ ok: boolean }>
  /** Clears this activity's own selection rows for `type`, reverting to inheritance. */
  resetToInherited: (type: ParameterType) => Promise<{ ok: boolean }>
}

const IS_OWN_FALSE: Record<ParameterType, boolean> = { quality: false, symptom: false, flag: false }

/**
 * Zero-backend / local-only mode (rule 6): there's no real per-activity
 * hierarchy to resolve server-side here, so this is a deliberately simple
 * preview, not a faithful simulation of the real inheritance chain (walking
 * a specific activity's ancestors client-side would be meaningfully more
 * code for a mode whose whole point is "usable without a backend," not
 * "behaviorally identical to one") — every activity starts fully inheriting
 * the full static default list; toggling one materializes THAT ACTIVITY's
 * own explicit set (kept in this hook instance's own state, never persisted
 * anywhere), same "reset to inherited clears it" contract as the real thing.
 *
 * Known, accepted gap (flagged in code review, not fixed — pre-existing
 * shape, not a regression this pivot introduced): this always rebuilds from
 * `localOnlyVocabulary()`, the static built-in list, not from whatever
 * `useParameterVocabulary`'s OWN local-only instance currently shows —
 * unlike the real backend (where both go through the same `parameter_options`
 * table), these two hooks keep fully independent in-memory state with zero
 * backend configured, exactly like the OLD per-activity model's own
 * `useParameterOptions` never shared local-only state across instances
 * either. A global option added/removed via "Your options" in this mode
 * won't appear/disappear here until a full reload. Real, but scoped to the
 * zero-backend preview path only — never reachable with an actual Supabase
 * project configured, which is how every real user experiences this feature.
 */
function localOnlyChecklist(
  ownSelections: Partial<Record<ParameterType, ReadonlySet<string>>>,
): { byType: Record<ParameterType, ChecklistOption[]>; isOwn: Record<ParameterType, boolean> } {
  const vocabulary = localOnlyVocabulary()
  const byType = emptyByParameterType<ChecklistOption>()
  const isOwn = { ...IS_OWN_FALSE }
  for (const type of Object.keys(vocabulary) as ParameterType[]) {
    const own = ownSelections[type]
    isOwn[type] = own !== undefined
    byType[type] = vocabulary[type].map((o) => ({
      optionId: o.id,
      label: o.label,
      iconKey: null,
      selected: own ? own.has(o.id) : true,
    }))
  }
  return { byType, isOwn }
}

/**
 * One activity's per-type checklist against the shared global vocabulary
 * (PICKER-CUSTOM-1 pivot) — the editing dialog's per-activity view
 * (`ParameterOptionsPanel`). `activityId: null` (nothing selected) returns an
 * idle, empty result and never fetches — this hook only ever makes sense for
 * a real, currently-open activity.
 */
export function useActivityParameterSelections(activityId: string | null): UseActivityParameterSelectionsResult {
  const [byType, setByType] = useState<Record<ParameterType, ChecklistOption[]>>(() => emptyByParameterType())
  const [isOwn, setIsOwn] = useState<Record<ParameterType, boolean>>(() => ({ ...IS_OWN_FALSE }))
  const [status, setStatus] = useState<ActivityParameterSelectionsStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  // Local-only mode's own per-(this activity)-per-type explicit selections —
  // reset whenever `activityId` changes (a fresh activity starts purely
  // inheriting; see this module's own local-only doc comment).
  const localOwnRef = useRef<Partial<Record<ParameterType, ReadonlySet<string>>>>({})

  const activityIdRef = useRef(activityId)
  activityIdRef.current = activityId

  const instanceIdRef = useRef<string | null>(null)
  if (!instanceIdRef.current) instanceIdRef.current = generateId()
  const instanceId = instanceIdRef.current

  const invalidationVersion = useParameterOptionsInvalidationVersion(activityId, instanceId)
  const vocabularyVersion = useParameterVocabularyInvalidationVersion(instanceId)

  const load = useCallback(async (cancelledRef: { current: boolean }) => {
    const currentActivityId = activityIdRef.current
    if (currentActivityId === null) {
      setByType(emptyByParameterType())
      setIsOwn({ ...IS_OWN_FALSE })
      setStatus('idle')
      return
    }

    if (!supabaseConfigured) {
      localOwnRef.current = {}
      const local = localOnlyChecklist(localOwnRef.current)
      setByType(local.byType)
      setIsOwn(local.isOwn)
      setStatus('ready')
      return
    }

    setStatus('loading')
    const [quality, symptom, flag] = await Promise.all([
      apiListActivityParameterChecklist(currentActivityId, 'quality'),
      apiListActivityParameterChecklist(currentActivityId, 'symptom'),
      apiListActivityParameterChecklist(currentActivityId, 'flag'),
    ])
    if (cancelledRef.current || activityIdRef.current !== currentActivityId) return

    if (quality === null || symptom === null || flag === null) {
      setStatus('error')
      setError('Could not load these options right now.')
      return
    }

    const toOption = (r: { optionId: string; label: string; iconKey: string | null; selected: boolean }): ChecklistOption => ({
      optionId: r.optionId,
      label: r.label,
      iconKey: r.iconKey,
      selected: r.selected,
    })
    setByType({ quality: quality.map(toOption), symptom: symptom.map(toOption), flag: flag.map(toOption) })
    setIsOwn({
      quality: quality[0]?.isOwn ?? false,
      symptom: symptom[0]?.isOwn ?? false,
      flag: flag[0]?.isOwn ?? false,
    })
    setStatus('ready')
  }, [])

  useEffect(() => {
    const cancelledRef = { current: false }
    void load(cancelledRef)
    return () => {
      cancelledRef.current = true
    }
    // See `useEffectiveParameterOptions`'s own comment on why both
    // invalidation versions are dependencies here even though `load` never
    // reads them directly.
  }, [load, activityId, invalidationVersion, vocabularyVersion])

  const toggle = useCallback(
    async (type: ParameterType, optionId: string, selected: boolean): Promise<{ ok: boolean }> => {
      const currentActivityId = activityIdRef.current
      if (currentActivityId === null) return { ok: false }

      // Local-first (rule 6): the checklist's own checkbox flips instantly,
      // before any round trip.
      setByType((prev) => ({
        ...prev,
        [type]: prev[type].map((o) => (o.optionId === optionId ? { ...o, selected } : o)),
      }))

      if (!supabaseConfigured) {
        // First toggle for this (activity, type): materialize the full
        // (inherited) default list as this activity's own set before
        // applying the change — see this module's own local-only doc
        // comment.
        const existingOwn = localOwnRef.current[type]
        const materialized = existingOwn ? new Set(existingOwn) : new Set(localOnlyVocabulary()[type].map((o) => o.id))
        if (selected) materialized.add(optionId)
        else materialized.delete(optionId)
        localOwnRef.current = { ...localOwnRef.current, [type]: materialized }
        setIsOwn((prev) => ({ ...prev, [type]: true }))
        return { ok: true }
      }

      const ok = await apiSetActivityParameterSelection(currentActivityId, type, optionId, selected)
      if (!ok) {
        setError('Saved on this device — will sync once you’re back online.')
        return { ok: false }
      }
      setIsOwn((prev) => ({ ...prev, [type]: true }))
      notifyParameterOptionsChanged(currentActivityId, instanceId)
      return { ok: true }
    },
    [instanceId],
  )

  const resetToInherited = useCallback(
    async (type: ParameterType): Promise<{ ok: boolean }> => {
      const currentActivityId = activityIdRef.current
      if (currentActivityId === null) return { ok: false }

      if (!supabaseConfigured) {
        const next = { ...localOwnRef.current }
        delete next[type]
        localOwnRef.current = next
        const local = localOnlyChecklist(localOwnRef.current)
        setByType(local.byType)
        setIsOwn(local.isOwn)
        return { ok: true }
      }

      const ok = await apiResetActivityParameterSelectionToInherited(currentActivityId, type)
      if (!ok) {
        setError('Could not reset this list right now.')
        return { ok: false }
      }
      const cancelledRef = { current: false }
      await load(cancelledRef)
      notifyParameterOptionsChanged(currentActivityId, instanceId)
      return { ok: true }
    },
    [instanceId, load],
  )

  return { byType, isOwn, status, error, toggle, resetToInherited }
}
