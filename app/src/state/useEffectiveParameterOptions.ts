import { useCallback, useEffect, useRef, useState } from 'react'
import { apiListEffectiveParameterOptions, type ParameterType } from '@/api/parameterOptions'
import { generateId } from '@/domain/scheduling'
import { supabaseConfigured } from '@/lib/supabaseClient'
import {
  useParameterOptionsInvalidationVersion,
  useParameterVocabularyInvalidationVersion,
} from './parameterOptionsInvalidation'
import { emptyByParameterType, localOnlyVocabulary } from './parameterOptionsLocalOnly'
import { provisionDefaultParameterOptionsOnce } from './parameterOptionsProvisioning'

export type ParameterOptionsStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface EffectiveOption {
  label: string
  iconKey: string | null
}

export interface UseEffectiveParameterOptionsResult {
  /** The resolved list a picker should actually show for this activity — its own selection if any, else its nearest ancestor's, else every global option (PICKER-CUSTOM-1's inheritance rule). */
  effective: Record<ParameterType, EffectiveOption[]>
  status: ParameterOptionsStatus
  error: string | null
}

/**
 * The current 18/6/14 defaults, read-only preview with zero backend
 * configured — reuses `parameterOptionsLocalOnly.ts`'s shared vocabulary
 * (found in code review: an earlier version of this function re-implemented
 * the same static mapping inline instead of calling it, defeating that
 * module's whole point — one place the 18/6/14 default labels/ids live, so
 * every zero-backend branch drifts together, never apart).
 */
function localOnlyEffective(): Record<ParameterType, EffectiveOption[]> {
  const vocabulary = localOnlyVocabulary()
  return {
    quality: vocabulary.quality.map((o) => ({ label: o.label, iconKey: null })),
    symptom: vocabulary.symptom.map((o) => ({ label: o.label, iconKey: null })),
    flag: vocabulary.flag.map((o) => ({ label: o.label, iconKey: null })),
  }
}

/**
 * The LOGGING flow's read of one activity's effective quality/symptom/flag
 * options — "what can I pick from right now" (`SlotEditor`'s staged activity,
 * feeding `LogActivityModal`'s pickers). Deliberately lean: PICKER-CUSTOM-1's
 * pivot to a shared global vocabulary (`20260925070000_parameter_options_
 * global_vocabulary.sql`) moved every WRITE concern — add/remove a global
 * option, toggle one activity's selection, reset to inherited — out of this
 * hook and into `useParameterVocabulary`/`useActivityParameterSelections`
 * (the EDITING dialog's own hooks). This one only ever reads the resolved
 * list; it has no `own`/`isOverridden`/`setOverride` surface any more.
 *
 * `activityId: null` (nothing resolved yet, or no backend) reads as "no
 * specific activity" — the server itself already resolves that to the full
 * global list (`internal.effective_parameter_option_ids`'s own inheritance
 * chain is empty when `p_activity_id` is null), so this hook needs no special
 * fallback branch of its own for it.
 */
export function useEffectiveParameterOptions(activityId: string | null): UseEffectiveParameterOptionsResult {
  const [effective, setEffective] = useState<Record<ParameterType, EffectiveOption[]>>(() =>
    supabaseConfigured ? emptyByParameterType() : localOnlyEffective(),
  )
  const [status, setStatus] = useState<ParameterOptionsStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const provisionedRef = useRef(false)

  // The LATEST `activityId`, kept in sync during render — lets any in-flight
  // `load()` call notice it's become stale, same guard `useActivityParameter
  // Selections` uses for the same reason.
  const activityIdRef = useRef(activityId)
  activityIdRef.current = activityId

  const instanceIdRef = useRef<string | null>(null)
  if (!instanceIdRef.current) instanceIdRef.current = generateId()
  const instanceId = instanceIdRef.current

  const invalidationVersion = useParameterOptionsInvalidationVersion(activityId, instanceId)
  const vocabularyVersion = useParameterVocabularyInvalidationVersion(instanceId)

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      if (!supabaseConfigured) {
        setStatus('ready')
        return
      }
      setStatus('loading')

      const [quality, symptom, flag] = await Promise.all([
        apiListEffectiveParameterOptions(activityId, 'quality'),
        apiListEffectiveParameterOptions(activityId, 'symptom'),
        apiListEffectiveParameterOptions(activityId, 'flag'),
      ])
      if (cancelledRef.current || activityIdRef.current !== activityId) return

      // Genuinely empty everywhere means this user has never been
      // provisioned — bootstrap once, then reload. A specific activity
      // legitimately having zero own rows is normal (inheritance) and would
      // never show as "everything empty" once the global vocabulary itself
      // has been seeded, so this only ever fires for a brand-new account.
      // Requires all three calls to have genuinely SUCCEEDED with zero rows
      // (`!== null`, not just `?? 0`) — found in code review: without that,
      // a transient network failure (RPC returns `null`) on an existing,
      // already-provisioned account read the exact same as "never
      // provisioned" and re-triggered a redundant provisioning attempt on
      // every such blip, for any activity, not just a genuinely new one.
      const allEmpty =
        !provisionedRef.current && quality?.length === 0 && symptom?.length === 0 && flag?.length === 0
      if (allEmpty) {
        provisionedRef.current = true
        const provisioned = await provisionDefaultParameterOptionsOnce()
        if (cancelledRef.current || activityIdRef.current !== activityId) return
        if (provisioned) {
          await load(cancelledRef)
          return
        }
      }

      if (quality === null || symptom === null || flag === null) {
        setStatus('error')
        setError('Could not load these options right now.')
        return
      }

      setEffective({ quality, symptom, flag })
      setStatus('ready')
    },
    [activityId],
  )

  useEffect(() => {
    const cancelledRef = { current: false }
    void load(cancelledRef)
    return () => {
      cancelledRef.current = true
    }
    // `invalidationVersion`/`vocabularyVersion` are intentionally in this
    // dependency list even though `load` never reads them directly — they're
    // the signals that this activity's OWN selection changed, or the GLOBAL
    // vocabulary changed, from some other hook instance, and this instance
    // needs to re-fetch to see that change (see
    // `parameterOptionsInvalidation.ts`'s own doc comment).
  }, [load, invalidationVersion, vocabularyVersion])

  return { effective, status, error }
}
