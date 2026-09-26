import { useCallback, useEffect, useRef, useState } from 'react'
import {
  apiCreateParameterOption,
  apiDeleteParameterOption,
  apiListParameterOptions,
  type ParameterOptionDto,
  type ParameterType,
} from '@/api/parameterOptions'
import { generateId } from '@/domain/scheduling'
import { supabaseConfigured } from '@/lib/supabaseClient'
import { notifyParameterVocabularyChanged } from './parameterOptionsInvalidation'
import { emptyByParameterType, localOnlyVocabulary } from './parameterOptionsLocalOnly'
import { provisionDefaultParameterOptionsOnce } from './parameterOptionsProvisioning'

export type ParameterVocabularyStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface UseParameterVocabularyResult {
  /** This user's full global vocabulary, grouped by type. The ONLY tier that ever holds real label text now (PICKER-CUSTOM-1 pivot). */
  byType: Record<ParameterType, ParameterOptionDto[]>
  status: ParameterVocabularyStatus
  error: string | null
  /** Adds one label to the global vocabulary for `type`. */
  addOption: (type: ParameterType, label: string) => void
  /** Removes one global option. `skipped: true` means the server blocked it (real logged history — rule 11); the caller should say so rather than pretend it disappeared. */
  removeOption: (id: string) => Promise<{ ok: true } | { ok: false; skipped: boolean }>
}

/** The current 18/6/14 defaults, read-only preview with zero backend configured — same synthetic ids `useActivityParameterSelections`'s own local-only branch uses (`parameterOptionsLocalOnly.ts`), so the two interoperate offline. */
function localOnlyByType(): Record<ParameterType, ParameterOptionDto[]> {
  const vocabulary = localOnlyVocabulary()
  const toDtoList = (type: ParameterType): ParameterOptionDto[] =>
    vocabulary[type].map((o, index) => ({ id: o.id, parameterType: type, label: o.label, iconKey: null, sortOrder: index }))
  return { quality: toDtoList('quality'), symptom: toDtoList('symptom'), flag: toDtoList('flag') }
}

function groupByType(rows: ParameterOptionDto[]): Record<ParameterType, ParameterOptionDto[]> {
  const grouped = emptyByParameterType<ParameterOptionDto>()
  for (const row of rows) grouped[row.parameterType].push(row)
  return grouped
}

/**
 * This user's global quality/chronic-symptom/protective-response vocabulary
 * — the top-level "manage your options" section of the tile/activity
 * editing dialog (`ParameterVocabularyPanel`), the ONE place free-text label
 * entry exists any more (PICKER-CUSTOM-1 pivot,
 * `20260925070000_parameter_options_global_vocabulary.sql`). Every activity
 * just SELECTS from this shared list (`useActivityParameterSelections`);
 * nothing here is scoped to any one activity.
 */
export function useParameterVocabulary(): UseParameterVocabularyResult {
  const [byType, setByType] = useState<Record<ParameterType, ParameterOptionDto[]>>(() =>
    supabaseConfigured ? emptyByParameterType() : localOnlyByType(),
  )
  const [status, setStatus] = useState<ParameterVocabularyStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const provisionedRef = useRef(false)

  const instanceIdRef = useRef<string | null>(null)
  if (!instanceIdRef.current) instanceIdRef.current = generateId()
  const instanceId = instanceIdRef.current

  const load = useCallback(async (cancelledRef: { current: boolean }) => {
    if (!supabaseConfigured) {
      setStatus('ready')
      return
    }
    setStatus('loading')
    const rows = await apiListParameterOptions()
    if (cancelledRef.current) return

    if (rows !== null && rows.length === 0 && !provisionedRef.current) {
      provisionedRef.current = true
      const provisioned = await provisionDefaultParameterOptionsOnce()
      if (cancelledRef.current) return
      if (provisioned) {
        await load(cancelledRef)
        return
      }
    }

    if (rows === null) {
      setStatus('error')
      setError('Could not load your options right now.')
      return
    }
    setByType(groupByType(rows))
    setStatus('ready')
  }, [])

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
      // Already shown (exact-match, the server's own uniqueness scope) — a
      // silent no-op rather than a visible duplicate chip. Found in code
      // review alongside the matching server-side fix
      // (`create_parameter_option` now returns the EXISTING id for a
      // duplicate label instead of raising a raw unique-violation): without
      // this client-side check too, re-adding an already-present label would
      // optimistically insert a SECOND, differently-id'd chip for the exact
      // same text, which the server's own fix would then silently resolve to
      // one row on the next reload with no in-between reconciliation — a
      // visible duplicate that fixes itself with no explanation.
      let isDuplicate = false
      // Local-first (rule 6): materializes instantly, before any round trip.
      setByType((prev) => {
        if (prev[type].some((o) => o.label === trimmed)) {
          isDuplicate = true
          return prev
        }
        const nextSortOrder = prev[type].reduce((max, o) => Math.max(max, o.sortOrder), -1) + 1
        return {
          ...prev,
          [type]: [...prev[type], { id, parameterType: type, label: trimmed, iconKey: null, sortOrder: nextSortOrder }],
        }
      })
      if (isDuplicate || !supabaseConfigured) return
      void apiCreateParameterOption(type, trimmed, null, id).then((serverId) => {
        if (serverId === null) {
          setError('Saved on this device — will sync once you’re back online.')
          return
        }
        // A genuine cross-device/cross-tab race on the exact same NEW label
        // (found in code review): the server's own dedupe-by-label fix
        // (`create_parameter_option`, `20260925070100_...`) can legitimately
        // return an EXISTING id that isn't the one this optimistic insert
        // used — reconcile this instance's own row to that real id rather
        // than leaving a phantom local-only id nothing on the server
        // actually has (any later action on it, e.g. removing it, would
        // otherwise fail as "not found" with no way to ever succeed).
        if (serverId !== id) {
          setByType((prev) => ({
            ...prev,
            [type]: prev[type].map((o) => (o.id === id ? { ...o, id: serverId } : o)),
          }))
        }
        notifyParameterVocabularyChanged(instanceId)
      })
    },
    [instanceId],
  )

  const removeOption = useCallback(
    async (id: string): Promise<{ ok: true } | { ok: false; skipped: boolean }> => {
      if (!supabaseConfigured) {
        setByType((prev) => {
          const next = emptyByParameterType<ParameterOptionDto>()
          for (const type of Object.keys(next) as ParameterType[]) {
            next[type] = prev[type].filter((o) => o.id !== id)
          }
          return next
        })
        return { ok: true }
      }

      const result = await apiDeleteParameterOption(id)
      if (!result.ok) {
        if (result.reason === 'has_history') return { ok: false, skipped: true }
        setError('Could not remove this right now — try again once you’re back online.')
        return { ok: false, skipped: false }
      }

      setByType((prev) => {
        const next = emptyByParameterType<ParameterOptionDto>()
        for (const type of Object.keys(next) as ParameterType[]) {
          next[type] = prev[type].filter((o) => o.id !== id)
        }
        return next
      })
      notifyParameterVocabularyChanged(instanceId)
      return { ok: true }
    },
    [instanceId],
  )

  return { byType, status, error, addOption, removeOption }
}
