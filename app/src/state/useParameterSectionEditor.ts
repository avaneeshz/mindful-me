import { useMemo, useState } from 'react'
import type { ParameterType } from '@/api/parameterOptions'
import type { UseActivityParameterSelectionsResult } from './useActivityParameterSelections'
import type { UseParameterVocabularyResult } from './useParameterVocabulary'

/** Structurally identical to `ActivityParameterSelectionsStatus`/`ParameterVocabularyStatus` (both `'idle'|'loading'|'ready'|'error'`) — this hook reads from whichever one applies to the current scope, so it needs a name of its own rather than importing either. */
export type ParameterSectionStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface ParameterSectionOption {
  label: string
  iconKey: string | null
}

/**
 * One option list's editing behaviour (an activity's quality, symptom or
 * protective-response options, or the person's global default list) —
 * Lumen's own `OptionSection` calls this directly. Classic's
 * `ParameterOptionsPanel`/`ParameterVocabularyPanel` don't call this hook
 * (they keep their own separate `ChecklistSection`/`VocabularySection`
 * implementations, predating this one) — found in code review: an earlier
 * version of this comment claimed the two interfaces literally SHARED this
 * one function, which was never true and would have misled a future change
 * into thinking fixing a rule here automatically reaches Classic too. What
 * IS actually shared, and is the real point of this rewiring, is the DATA
 * both read/write underneath — `useParameterVocabulary`/
 * `useActivityParameterSelections`, the same instances Classic's own
 * components call directly. The RULES below (never empty a list, keep
 * options with logged history, one write at a time) are deliberately kept
 * in sync BY HAND across this hook and Classic's own two components, the
 * same way this codebase already keeps other closely-related-but-separate
 * implementations in sync elsewhere — not enforced by a shared call site.
 *
 * Originally built against `state/useParameterOptions` (PICKER-CUSTOM-1's
 * now-replaced per-activity override model, one independent list per
 * activity). Rewired here onto the model that replaced it — Classic's
 * shared global vocabulary (`useParameterVocabulary`) plus each activity's
 * own SELECTION against it (`useActivityParameterSelections`) — found while
 * merging Lumen's own settings screens into this branch: option data is
 * account-level state, not interface-specific, so it has to be the one real
 * shared model, not a second copy kept alive underneath Lumen alone (see the
 * branch's own merge report for the full reasoning). Nothing about this
 * hook's own EXTERNAL shape changed — `ParameterOptionsPanel`/Lumen's
 * `OptionSection` still get the same `effective`/`overridden`/`busy`/
 * `rowError`/`remove`/`add`/`reset` contract; only which primitives compute
 * it did.
 *
 * `activityId: null` edits the shared GLOBAL vocabulary directly (Classic's
 * "Your options" / Lumen's "Default options" scope) — there's no separate
 * activity to select against at that level; the vocabulary itself IS what
 * every still-inheriting activity falls back to
 * (`useEffectiveParameterOptions`'s own doc comment). "Remove" here is a
 * REAL, history-safe deletion from the shared list (`useParameterVocabulary.
 * removeOption`) — the same one `ParameterVocabularyPanel` already exposes.
 *
 * `activityId` set edits THAT activity's own SELECTION against the shared
 * vocabulary (`useActivityParameterSelections`). "Remove" here only ever
 * DESELECTS — the option stays exactly as available to every other activity
 * (never a delete, and so never a "logged history" guard: deselecting
 * changes nothing about any past entry, rule 12). "Add" selects an existing
 * global option, or, when the typed label doesn't exist in the vocabulary
 * yet, creates it there first (`useParameterVocabulary.addOption`, which
 * hands back the id it just used synchronously — see that function's own
 * doc comment) and selects it for this activity in the same motion — one
 * user-visible action, two underlying writes, matching how the OLD model's
 * single atomic `setOverride` used to feel from this hook's own callers,
 * even though the new model has no single RPC that does both at once.
 *
 * Known, accepted gap (same category this codebase already accepts
 * elsewhere for two independent hook instances watching the same activity —
 * see `SlotEditor.tsx`'s own doc comment): selecting a BRAND-NEW label for
 * an activity fires the real write immediately, but this activity's own
 * checklist (a separate hook instance from the vocabulary one) only shows
 * the new chip once its own reload catches up (the vocabulary-changed
 * notification `addOption` already sends) — a brief lag, not a stale value
 * that sticks.
 *
 * `selections`/`vocabulary` are taken as PARAMETERS, one instance per
 * SCREEN, not minted fresh inside this hook — found in code review: an
 * earlier version called `useActivityParameterSelections`/
 * `useParameterVocabulary` itself, so Lumen's 3-section-per-screen
 * `OptionSection` (quality/symptom/flag) each independently instantiated
 * both, turning what the old shared-instance design fetched once per screen
 * into 3 vocabulary fetches plus 9 checklist calls. Callers instantiate
 * both ONCE (`library.tsx`'s `ActivityOptions`/`DefaultsLevel`, mirroring
 * exactly how they fed a single `useParameterOptions(...)` result to all
 * three sections before this rewiring) and pass them to every section.
 */
export function useParameterSectionEditor(
  section: { type: ParameterType; label: string },
  activityId: string | null,
  selections: UseActivityParameterSelectionsResult,
  vocabulary: UseParameterVocabularyResult,
) {
  const [rowError, setRowError] = useState<string | null>(null)
  // Which single control has an in-flight mutation, if any — `'add'`/
  // `'reset'` drive ONLY their own button's spinner (found in self-review: a
  // single shared `submitting` boolean made the Add button spin while a
  // Reset was actually running, and vice versa, whenever both controls were
  // visible at once). `busy` below still gates EVERY control in the section
  // together regardless of which of the three this is, so double-submit
  // protection (rule 9) is unaffected by splitting it for display purposes.
  const [pendingAction, setPendingAction] = useState<'add' | 'reset' | null>(null)
  const [removingLabel, setRemovingLabel] = useState<string | null>(null)

  const status: ParameterSectionStatus = activityId === null ? vocabulary.status : selections.status
  const loadError = activityId === null ? vocabulary.error : selections.error

  // Every chip currently shown for this section — the global vocabulary
  // itself at the fallback scope, or this activity's own resolved
  // (inherited-or-overridden) SELECTED set otherwise.
  const effective = useMemo((): ParameterSectionOption[] => {
    if (activityId === null) {
      return vocabulary.byType[section.type].map((o) => ({ label: o.label, iconKey: o.iconKey }))
    }
    return selections.byType[section.type]
      .filter((o) => o.selected)
      .map((o) => ({ label: o.label, iconKey: o.iconKey }))
  }, [activityId, section.type, vocabulary.byType, selections.byType])

  const overridden = activityId === null ? false : selections.isOwn[section.type]
  const busy = pendingAction !== null || removingLabel !== null

  async function handleRemove(label: string) {
    if (busy) return
    // Never let this list empty out entirely, in EITHER scope — found in
    // code review (carried forward from the old model's own identical
    // guard): every still-inheriting activity's effective list ultimately
    // resolves to "every option currently in the global list"
    // (`internal.effective_parameter_option_ids`'s own doc comment), so a
    // global list of zero would leave every such activity with nothing to
    // pick from while logging, with no separate "explicitly empty" state to
    // explain it — and an activity narrowed to zero of its OWN selections
    // reads identically to "never customized" server-side, so it would
    // silently show the full list checked again on the next load with no
    // explanation either.
    if (effective.length <= 1) {
      setRowError(
        activityId === null
          ? `Your ${section.label.toLowerCase()} list can’t be emptied — add a different option to replace “${label}” first.`
          : `This activity can’t show zero ${section.label.toLowerCase()} options — add a different option to replace “${label}” first.`,
      )
      return
    }
    setRowError(null)
    setRemovingLabel(label)
    try {
      if (activityId === null) {
        const option = vocabulary.byType[section.type].find((o) => o.label === label)
        if (!option) return
        const result = await vocabulary.removeOption(option.id)
        if (!result.ok) {
          setRowError(
            result.skipped
              ? `"${label}" has already been logged on a real activity — it can’t be removed.`
              : 'Could not remove this right now — try again once you’re back online.',
          )
        }
        return
      }
      const option = selections.byType[section.type].find((o) => o.label === label)
      if (!option) return
      const result = await selections.toggle(section.type, option.optionId, false)
      if (!result.ok) {
        setRowError('Could not remove this right now — try again once you’re back online.')
      }
    } finally {
      setRemovingLabel(null)
    }
  }

  async function handleAdd(label: string): Promise<boolean> {
    if (busy) return false
    setRowError(null)
    // No "already in this list" guard here, same reasoning the old model's
    // own version of this hook already documented: a genuine RETRY of a
    // previously-failed add for this exact label is a harmless resend, not
    // something to silently short-circuit.
    setPendingAction('add')
    try {
      if (activityId === null) {
        await vocabulary.addOption(section.type, label)
        return true
      }
      const existing = selections.byType[section.type].find((o) => o.label === label)
      if (existing) {
        if (existing.selected) return true
        const result = await selections.toggle(section.type, existing.optionId, true)
        if (!result.ok) setRowError('Could not add this right now — try again once you’re back online.')
        return result.ok
      }
      // Found in code review: this used to fire `toggle` against the
      // synchronously-returned OPTIMISTIC id immediately, racing the
      // create's own still-in-flight round trip — the select could reach
      // the server and fail its own `invalid_option` check before the
      // create's insert had even committed. Awaiting the real id first (see
      // `addOption`'s own doc comment) closes that race; the local chip
      // still appears instantly regardless, since that happens inside
      // `addOption` itself before this await.
      const id = await vocabulary.addOption(section.type, label)
      if (id === null) return false
      const result = await selections.toggle(section.type, id, true)
      if (!result.ok) {
        setRowError('Could not add this right now — try again once you’re back online.')
        return false
      }
      return true
    } finally {
      setPendingAction(null)
    }
  }

  async function handleReset() {
    if (busy || activityId === null) return
    setRowError(null)
    setPendingAction('reset')
    try {
      const result = await selections.resetToInherited(section.type)
      if (!result.ok) {
        setRowError('Could not reset this right now — try again once you’re back online.')
      }
    } finally {
      setPendingAction(null)
    }
  }

  return {
    status,
    /** A LOAD failure, distinct from `rowError` (a specific mutation's own failure) — see this hook's own callers for how each is shown. */
    error: loadError,
    overridden,
    effective,
    busy,
    pendingAction,
    removingLabel,
    rowError,
    clearError: () => setRowError(null),
    remove: handleRemove,
    /** Resolves true once the option is saved — the caller then clears its draft. */
    add: handleAdd,
    reset: handleReset,
  }
}
