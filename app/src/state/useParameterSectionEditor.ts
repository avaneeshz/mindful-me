import { useState } from 'react'
import type { ParameterType } from '@/api/parameterOptions'
import type { UseParameterOptionsResult } from './useParameterOptions'

/**
 * One option list's editing behaviour (an activity's quality, symptom or
 * protective-response options, or the person's fallback default) — shared
 * by Classic's Activity Library (`ParameterOptionsPanel`) and Lumen's, so the
 * rules can never drift between the two: a list is never emptied from a
 * remove, an option with logged history stays, every control in a section
 * is disabled while any of its writes is in flight (rule 9), and the same
 * plain-language messages explain each case. Moved here from
 * `ParameterOptionsPanel` unchanged; only the draft/"adding" form state
 * stays with each interface's own UI.
 */
export function useParameterSectionEditor(
  section: { type: ParameterType; label: string },
  activityName: string | null,
  data: UseParameterOptionsResult,
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

  const overridden = data.isOverridden[section.type]
  const effective = data.effective[section.type]
  // One section-wide busy flag — every control in THIS section (not just the
  // one just clicked) disables while a `setOverride`/`resetToInherited` call
  // is in flight, so two near-simultaneous clicks (remove one chip, add
  // another) can never race each other's "current effective list" snapshot
  // and silently clobber one write with the other (rule 9's double-submit
  // guard, applied to every mutation here, not only the Add button).
  const busy = pendingAction !== null || removingLabel !== null

  // Every chip in the resolved list — inherited or already this node's own —
  // gets a working remove control. Removing one materializes this node's own
  // override as "the current effective list, minus that one label," in a
  // single atomic `setOverride` call rather than retyping everything kept.
  //
  // Both handlers wrap their `setOverride` call in try/finally: `setOverride`
  // itself only ever RESOLVES (with `{ok:false}` on a handled failure, never
  // rejects) in normal operation, but a thrown/rejected promise from
  // somewhere unexpected (an aborted fetch, a client-side exception) must
  // still release this section's busy state — otherwise every control here
  // stays permanently disabled with no way to recover short of a reload
  // (found in self-review).
  async function handleRemove(label: string) {
    if (busy) return
    setRowError(null)
    setRemovingLabel(label)
    try {
      const next = effective.filter((o) => o.label !== label).map((o) => o.label)

      // Narrowing down to NOTHING is never allowed from this remove control,
      // for every scope (found in self-review, twice over): a real activity
      // with own rows already needs `resetToInherited` here, not
      // `setOverride([])` — an empty own-row set is indistinguishable from
      // "no override" server-side, so `setOverride([])` would optimistically
      // flash "No options configured yet" and then silently revert to the
      // real, non-empty inherited list a moment later with no explanation.
      // A real activity with NO own rows yet (still purely inherited) has no
      // own row for `resetToInherited` to clear either — it would be a
      // genuine no-op. The FALLBACK scope (`activityName === null`) is the
      // one case that CAN technically store a genuinely empty list (there's
      // no ancestor above it to collapse into) — but doing so would silently
      // zero out the default list every other, not-yet-customized activity
      // falls back to, a large-blast-radius, one-click, no-undo action.
      // Simplest and most consistent: never allow it from here, in any
      // scope — always keep at least one option showing, and point the user
      // at "Add" instead.
      if (next.length === 0) {
        if (activityName !== null && overridden) {
          const result = await data.resetToInherited(section.type)
          if (!result.ok) {
            setRowError('Could not remove this right now — try again once you’re back online.')
            return
          }
          if (result.skippedLabels.includes(label)) {
            setRowError(`"${label}" has already been logged on a real activity — it can’t be removed.`)
          }
        } else {
          setRowError(
            activityName === null
              ? `Your default ${section.label.toLowerCase()} list can’t be emptied — add a different option to replace “${label}” first.`
              : `This activity can’t show zero ${section.label.toLowerCase()} options — add a different option to replace “${label}” first.`,
          )
        }
        return
      }

      const result = await data.setOverride(section.type, next)
      if (!result.ok) {
        setRowError('Could not remove this right now — try again once you’re back online.')
        return
      }
      if (result.skippedLabels.includes(label)) {
        setRowError(`"${label}" has already been logged on a real activity — it can’t be removed.`)
      }
    } finally {
      setRemovingLabel(null)
    }
  }

  async function handleAdd(label: string): Promise<boolean> {
    if (busy) return false
    setRowError(null)
    // No "already in this list" guard here (found in self-review — an
    // earlier version had one, to dodge a since-fixed SQL error on a
    // duplicate label): `setOverride` now dedupes client-side too, the same
    // way its RPC dedupes server-side, so sending an already-shown label is
    // simply a harmless no-op — and, more importantly, a genuine RETRY of a
    // previously-FAILED add for this exact label (already visible locally
    // via that earlier attempt's optimistic update, rule 6) actually resends
    // the request instead of silently short-circuiting.
    setPendingAction('add')
    try {
      const next = [...effective.map((o) => o.label), label]
      const result = await data.setOverride(section.type, next)
      if (!result.ok) {
        setRowError('Could not add this right now — try again once you’re back online.')
        return false
      }
      return true
    } finally {
      setPendingAction(null)
    }
  }

  // "Reset to inherited" used to fire straight from its own `onClick` with no
  // guard at all (found in self-review) — the ONE mutation in this section
  // that `busy` never actually covered, despite the surrounding comment's
  // claim that it did: a second click, or an Add/Remove click, while a reset
  // was still in flight, would race its own `load()` reconciliation against
  // that concurrent write, with whichever settled last silently winning.
  async function handleReset() {
    if (busy) return
    setRowError(null)
    setPendingAction('reset')
    try {
      const result = await data.resetToInherited(section.type)
      if (!result.ok) {
        setRowError('Could not reset this right now — try again once you’re back online.')
        return
      }
      if (result.skippedLabels.length > 0) {
        setRowError(
          result.skippedLabels.length === 1
            ? `"${result.skippedLabels[0]}" has already been logged on a real activity — it stayed in this list.`
            : `${result.skippedLabels.length} options have already been logged on a real activity — they stayed in this list.`,
        )
      }
    } finally {
      setPendingAction(null)
    }
  }

  return {
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
