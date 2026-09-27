import { useState } from 'react'
import { Loader2, Plus, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { fieldClass } from '@/components/ui/formField'
import type { ParameterType } from '@/api/parameterOptions'
import type { UseParameterOptionsResult } from '@/state/useParameterOptions'

const SECTIONS: { type: ParameterType; label: string; helper: string }[] = [
  { type: 'quality', label: 'Activity quality', helper: 'How this activity felt when logged.' },
  { type: 'symptom', label: 'Chronic symptoms', helper: 'Symptoms noticed around this activity.' },
  { type: 'flag', label: 'Protective response', helper: 'A single protective-response tag, at most one per log.' },
]

/**
 * One activity's (or, with `activityName: null`, this user's fallback
 * default's) three customizable option lists — quality / chronic symptoms /
 * protective response (PICKER-CUSTOM-1). Shows the EFFECTIVE (resolved)
 * list always; editing only ever touches this node's OWN rows, and "Reset
 * to inherited" clears them back to whatever an ancestor (or the fallback)
 * already provides.
 */
export function ParameterOptionsPanel({
  activityName,
  data,
}: {
  activityName: string | null
  data: UseParameterOptionsResult
}) {
  return (
    <section aria-label="Parameter options" className="flex flex-col gap-lg">
      <div className="flex items-center justify-between">
        <h2 className="text-btn font-semibold text-ink">
          {activityName ? `Options for "${activityName}"` : 'Your default options'}
        </h2>
        {data.status === 'loading' && <Loader2 aria-hidden="true" className="size-[16px] animate-spin text-ink-dim" />}
      </div>
      {data.error && <p className="text-caption text-ink-dim">{data.error}</p>}

      {SECTIONS.map((section) => (
        <ParameterSection key={section.type} section={section} activityName={activityName} data={data} />
      ))}
    </section>
  )
}

function ParameterSection({
  section,
  activityName,
  data,
}: {
  section: (typeof SECTIONS)[number]
  activityName: string | null
  data: UseParameterOptionsResult
}) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
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

  async function handleAdd(label: string) {
    if (busy) return
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
        return
      }
      setDraft('')
      setAdding(false)
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

  return (
    <div className="flex flex-col gap-sm rounded-md border border-line-soft bg-bg p-md">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div>
          <h3 className="text-body font-semibold text-ink">{section.label}</h3>
          <p className="text-caption text-ink-dim">{section.helper}</p>
        </div>
        <span className="text-caption text-ink-dim">
          {activityName === null ? 'Default for every activity' : overridden ? 'Customized for this activity' : 'Inherited'}
        </span>
      </div>

      {data.status === 'ready' && effective.length === 0 && (
        <p className="text-caption text-ink-dim">No options configured yet.</p>
      )}

      <ul className="flex flex-wrap gap-xs" aria-label={`${section.label} options`}>
        {effective.map((option) => {
          const isRemoving = removingLabel === option.label
          return (
            <li key={option.label}>
              <Chip size="sm" tone="surface" className="gap-xs pr-xs">
                <span>{option.label}</span>
                <button
                  type="button"
                  aria-label={`Remove ${option.label}`}
                  onClick={() => void handleRemove(option.label)}
                  disabled={busy}
                  className="flex size-[16px] items-center justify-center rounded-full text-ink-dim hover:text-ink disabled:opacity-50"
                >
                  {isRemoving ? (
                    <Loader2 aria-hidden="true" className="size-[10px] animate-spin" />
                  ) : (
                    <X aria-hidden="true" className="size-[10px]" />
                  )}
                </button>
              </Chip>
            </li>
          )
        })}
      </ul>

      {rowError && <p role="alert" className="text-caption text-ink-dim">{rowError}</p>}

      <div className="flex flex-wrap items-center gap-sm">
        {adding ? (
          <form
            className="flex items-center gap-sm"
            onSubmit={(e) => {
              e.preventDefault()
              const trimmed = draft.trim()
              if (trimmed === '' || busy) return
              void handleAdd(trimmed)
            }}
          >
            <input
              autoFocus
              className={fieldClass}
              placeholder="New option"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label={`New ${section.label} option`}
              disabled={busy}
            />
            <Button type="submit" size="inline" disabled={draft.trim() === '' || busy}>
              {pendingAction === 'add' && <Loader2 aria-hidden="true" className="size-[13px] animate-spin" />}
              <span>{pendingAction === 'add' ? 'Adding…' : 'Add'}</span>
            </Button>
            <Button type="button" variant="ghost" size="inline" onClick={() => setAdding(false)} disabled={busy}>
              Cancel
            </Button>
          </form>
        ) : (
          <Button variant="outline" size="inline" onClick={() => setAdding(true)} disabled={busy} className="px-md py-sm">
            <Plus aria-hidden="true" className="size-[13px]" />
            <span>Add option</span>
          </Button>
        )}

        {activityName !== null && overridden && (
          <Button variant="ghost" size="inline" disabled={busy} onClick={() => void handleReset()}>
            {pendingAction === 'reset' ? (
              <Loader2 aria-hidden="true" className="size-[13px] animate-spin" />
            ) : (
              <RotateCcw aria-hidden="true" className="size-[13px]" />
            )}
            <span>Reset to inherited</span>
          </Button>
        )}
      </div>
    </div>
  )
}
