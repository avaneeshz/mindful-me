import { useCallback, useEffect, useRef, useState } from 'react'
import {
  apiListEffectiveParameterOptions,
  apiListParameterOptions,
  apiResetParameterOptionsToInherited,
  apiSetParameterOptionsOverride,
  apiUpdateParameterOption,
  type ParameterOptionDto,
  type ParameterType,
} from '@/api/parameterOptions'
import { FLAGS, QUALITIES, SYMPTOMS } from '@/data/activities'
import { generateId } from '@/domain/scheduling'
import { supabaseConfigured } from '@/lib/supabaseClient'
import { notifyParameterOptionsChanged, useParameterOptionsInvalidationVersion } from './parameterOptionsInvalidation'
import { provisionDefaultParameterOptionsOnce } from './parameterOptionsProvisioning'

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
  renameOption: (id: string, type: ParameterType, label: string) => void
  /**
   * Clears this node's own rows for `type`, falling back to inheritance.
   * `skippedLabels` names any own row that survived anyway because it
   * already has real logged history on this activity — same contract
   * `setOverride` uses (its own doc comment references this one). Found in
   * self-review: this used to return `Promise<void>`, silently discarding
   * that exact information despite `setOverride`'s doc comment already
   * claiming it was exposed here.
   */
  resetToInherited: (type: ParameterType) => Promise<{ ok: true; skippedLabels: string[] } | { ok: false }>
  /**
   * Materializes this node's own list to be EXACTLY `labels` (real subset
   * narrowing, e.g. 5 of 18 inherited options, in one atomic step — never N
   * sequential inserts). This is the ONE mutation path a chip's add/remove
   * controls use — both "add one to whatever's currently shown" and "remove
   * one" compute their desired full list and call this (see
   * `ParameterOptionsPanel.tsx`), rather than adding/deleting one row at a
   * time, which would drop the rest of an inherited list on the very first
   * add. `skippedLabels` names any requested-for-removal label that survived
   * anyway because it already has real logged history on this activity (the
   * same rule `resetToInherited`'s own `skippedLabels` already enforce).
   */
  setOverride: (type: ParameterType, labels: string[]) => Promise<{ ok: true; skippedLabels: string[] } | { ok: false }>
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

  // The LATEST `activityId`, kept in sync during render (not an effect, so
  // it can never lag a render behind) — lets any in-flight `load()` call
  // notice it's become stale (found in self-review). `setOverride`/
  // `resetToInherited` each spin up their OWN fresh, never-externally-
  // cancelled `cancelledRef` for their own follow-up `load()` call (unlike
  // the mount/activityId-change effect below, which owns and cancels its
  // own); without this, a slow multi-round-trip mutation for activity A that
  // resolves AFTER the user has already switched to activity B would still
  // overwrite this hook's shared `own`/`effective` state with A's data,
  // while everything else on screen (heading, selection) already reflects B.
  const activityIdRef = useRef(activityId)
  activityIdRef.current = activityId

  // A stable per-instance identity, generated once and never changing for
  // this hook instance's whole lifetime — lets `parameterOptionsInvalidation`
  // tell "this instance just mutated the activity" apart from "some OTHER
  // instance did," so a mutation never redundantly re-fetches itself (see
  // that module's own doc comment).
  const instanceIdRef = useRef<string | null>(null)
  if (!instanceIdRef.current) instanceIdRef.current = generateId()
  const instanceId = instanceIdRef.current

  // Bumps whenever ANOTHER `useParameterOptions` instance watching this same
  // `activityId` successfully mutates it (`notifyParameterOptionsChanged`) —
  // see `parameterOptionsInvalidation.ts`'s own doc comment for the concrete
  // bug this closes (two simultaneous instances, e.g. `SlotEditor`'s staged
  // activity and `ActivityLibraryPanel`'s selected activity, now genuinely
  // possible in the same view — found in self-review).
  const invalidationVersion = useParameterOptionsInvalidationVersion(activityId, instanceId)

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
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
      // Stale once EITHER this specific call was cancelled (unmount, or the
      // mount/activityId-change effect below moving on to a newer `load`) OR
      // the hook has since moved on to a different activity entirely (a
      // `setOverride`/`resetToInherited` call started for a since-abandoned
      // activity) — either way, applying this response now would show the
      // wrong activity's data.
      if (cancelledRef.current || activityIdRef.current !== activityId) return

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
        // `provisionDefaultParameterOptionsOnce` (not
        // `apiProvisionDefaultParameterOptions` directly) — found by code
        // review: `ActivityLibraryPanel` now renders alongside `SlotEditor`,
        // so a brand-new user opening Edit mode can have TWO
        // `useParameterOptions(null)` instances (one per component) hit this
        // branch at once. Without de-duping, both would call the RPC, the
        // second would trip the unique index (a plain check-then-insert, not
        // an atomic upsert) and fail, and that losing instance would fall
        // through to stale empty state below instead of reloading. This
        // closes the SAME-TAB case (see `parameterOptionsProvisioning.ts`'s
        // own doc comment for why it's only ever that, not cross-tab/
        // cross-device too) — `provision_default_parameter_options()` itself
        // also now takes an advisory lock server-side for the general case.
        const provisioned = await provisionDefaultParameterOptionsOnce()
        if (cancelledRef.current || activityIdRef.current !== activityId) return
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
    },
    [activityId],
  )

  useEffect(() => {
    const cancelledRef = { current: false }
    void load(cancelledRef)
    return () => {
      cancelledRef.current = true
    }
    // `invalidationVersion` is intentionally in this dependency list even
    // though `load` never reads it directly — it's the signal that ANOTHER
    // instance watching this same `activityId` just mutated it, and this
    // instance needs to re-fetch to see that change (see
    // `parameterOptionsInvalidation.ts`'s own doc comment).
  }, [load, invalidationVersion])

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

  const resetToInherited = useCallback(
    async (type: ParameterType): Promise<{ ok: true; skippedLabels: string[] } | { ok: false }> => {
      // Zero backend configured (rule 6): there's no real ancestor/fallback
      // to resolve against on a server this hook was never given, so this
      // just puts the node back to the packaged static defaults it started
      // from — matches `setOverride`'s own local-only branch. Found in
      // self-review: this used to unconditionally no-op here (`!supabaseConfigured`
      // was part of the very first guard), which meant `ParameterOptionsPanel`
      // — now that EVERY chip, including a purely-inherited default, has a
      // working remove control — could dead-end a local-only session: remove
      // a default option, `own[type]` becomes non-empty ("Customized for
      // this activity" + "Reset to inherited" appears), but clicking that
      // Reset button did nothing at all. There's no real server-side history
      // to check in this mode, so nothing can ever be "skipped."
      if (!supabaseConfigured) {
        setOwn((prev) => ({ ...prev, [type]: [] }))
        setEffective((prev) => ({ ...prev, [type]: localOnlyEffective()[type] }))
        return { ok: true, skippedLabels: [] }
      }
      if (activityId === null) return { ok: false }
      const result = await apiResetParameterOptionsToInherited(activityId, type)
      if (!result.ok) {
        // Same staleness guard as `setOverride`'s own failure branch (found
        // in self-review, applied here too for consistency): don't surface
        // an error for an activity the user has since navigated away from.
        if (activityIdRef.current === activityId) setError('Could not reset this list right now.')
        return result
      }
      const cancelledRef = { current: false }
      await load(cancelledRef)
      // Tell every OTHER `useParameterOptions` instance watching this same
      // activity to re-fetch too — see `parameterOptionsInvalidation.ts`'s
      // own doc comment for why this matters now that two such instances can
      // genuinely coexist in the same view.
      notifyParameterOptionsChanged(activityId, instanceId)
      return result
    },
    [activityId, load],
  )

  const setOverride = useCallback(
    (type: ParameterType, labels: string[]): Promise<{ ok: true; skippedLabels: string[] } | { ok: false }> => {
      // Trim, drop blanks, THEN dedupe keeping each label's first occurrence
      // (`Set` preserves insertion order) — mirrors
      // `set_parameter_options_override`'s own SQL-side dedupe exactly (see
      // that migration's own doc comment), so this is safe and idempotent to
      // call with an accidental duplicate from EITHER side. Found in
      // self-review: without deduping here too, `ParameterOptionsPanel`
      // needed its own separate "already in this list" guard before calling
      // this — which then blocked a legitimate RETRY of a previously-FAILED
      // add for the same label (the optimistic update below had already put
      // it in `effective`, so the guard treated a genuine retry as a no-op
      // and never actually resent the request).
      const cleaned = Array.from(new Set(labels.map((l) => l.trim()).filter((l) => l !== '')))

      // Rule 6 — local-first, always, not only in local-only mode: this
      // materializes the requested list into local state SYNCHRONOUSLY,
      // before any network round trip, exactly like `renameOption` elsewhere
      // in this hook (found in self-review: the previous version of this
      // function blocked on the full round trip — list, RPC, then a second
      // full re-fetch — before touching any state at all, the one write path
      // here that didn't land locally first).
      setOwn((prev) => ({
        ...prev,
        [type]: cleaned.map((label, index) => ({
          id: generateId(),
          activityId,
          parameterType: type,
          label,
          iconKey: null,
          sortOrder: index,
        })),
      }))
      setEffective((prev) => ({ ...prev, [type]: cleaned.map((label) => ({ label, iconKey: null })) }))

      // Zero backend configured: there's no real server-side history to
      // check in this mode, so nothing can ever be "skipped" — the optimistic
      // update above IS the final state.
      if (!supabaseConfigured) {
        return Promise.resolve({ ok: true, skippedLabels: [] })
      }

      return (async () => {
        const result = await apiSetParameterOptionsOverride(activityId, type, cleaned)
        if (!result.ok) {
          // Matches `renameOption`'s own local-first contract: the
          // optimistic value above is KEPT (never rolled back) and will
          // retry on the next natural reload — an offline edit still works
          // locally, same as everywhere else in this app (rule 6). Guarded
          // by the same staleness check `load()` uses (found in
          // self-review): without it, a slow failure for activity A that
          // resolves after the user has already switched to activity B would
          // still surface A's error message as if it were B's.
          if (activityIdRef.current === activityId) setError('Saved on this device — will sync once you’re back online.')
          return result
        }
        // Tell every OTHER `useParameterOptions` instance watching this same
        // activity to re-fetch — regardless of whether THIS instance itself
        // needs to reload below (see `parameterOptionsInvalidation.ts`'s own
        // doc comment). Without this, e.g. `ActivityLibraryPanel` removing a
        // quality option would never be seen by `SlotEditor`'s separate
        // `useParameterOptions(stagedActivityId)` instance for the same
        // activity, which could then let the user pick — and commit — a
        // value the server would reject, permanently wedging that
        // activity's background sync (found in self-review).
        notifyParameterOptionsChanged(activityId, instanceId)
        if (result.skippedLabels.length > 0) {
          // The server kept one or more labels alive (real logged history)
          // that the optimistic update above had already removed locally —
          // reconcile by re-reading this node's authoritative state rather
          // than hand-patching just the skipped labels back in. This is the
          // rare, edge-case correction path, not the common one — an
          // ordinary add or remove that fully succeeds needs no follow-up
          // round trip at all, since the optimistic update above already
          // matches what the server just stored.
          //
          // NEVER called with `labels: []` — narrowing an activity's own
          // list down to NOTHING is a documented edge case of this RPC (see
          // that migration's own doc comment): an empty own-row set is
          // indistinguishable from "no override," so the server would
          // silently revert to the INHERITED list rather than storing a
          // deliberately-empty one. `ParameterOptionsPanel` routes THAT case
          // through `resetToInherited` instead (found in self-review — this
          // function used to be the one call site for both, and reconciling
          // after an empty override meant the optimistic "No options
          // configured yet" flashed on screen for a moment before silently
          // reverting to the real, non-empty inherited list, with no
          // explanation).
          const cancelledRef = { current: false }
          await load(cancelledRef)
        }
        return result
      })()
    },
    [activityId, load],
  )

  const isOverridden: Record<ParameterType, boolean> = {
    quality: own.quality.length > 0,
    symptom: own.symptom.length > 0,
    flag: own.flag.length > 0,
  }

  return { own, effective, isOverridden, status, error, renameOption, resetToInherited, setOverride }
}
