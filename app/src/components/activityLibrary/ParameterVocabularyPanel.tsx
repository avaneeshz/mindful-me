import { useState } from 'react'
import { Loader2, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { fieldClass } from '@/components/ui/formField'
import type { ParameterType } from '@/api/parameterOptions'
import type { UseParameterVocabularyResult } from '@/state/useParameterVocabulary'

const SECTIONS: { type: ParameterType; label: string; helper: string }[] = [
  { type: 'quality', label: 'Activity quality', helper: 'The shared list every activity can pick from when logged.' },
  { type: 'symptom', label: 'Chronic symptoms', helper: 'The shared list every activity can pick from.' },
  { type: 'flag', label: 'Protective response', helper: 'The shared list every activity can pick from — one tag per log.' },
]

/**
 * The global quality/chronic-symptom/protective-response vocabulary — the
 * ONLY place free-text option entry exists any more (PICKER-CUSTOM-1 pivot,
 * see `useParameterVocabulary`'s own doc comment). Shown once, at the top of
 * the tile/activity editing dialog, before any tile is opened — a specific
 * activity's own view (`ParameterOptionsPanel`) is a CHECKLIST against this
 * exact list, never its own free-text entry.
 */
export function ParameterVocabularyPanel({ data }: { data: UseParameterVocabularyResult }) {
  return (
    <section aria-label="Your options" className="flex flex-col gap-lg rounded-md border border-line bg-bg p-lg">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-btn font-semibold text-ink">Your options</h2>
          <p className="text-caption text-ink-dim">
            One shared list per type — every activity picks from these; nothing here is shared with anyone else.
          </p>
        </div>
        {data.status === 'loading' && <Loader2 aria-hidden="true" className="size-[16px] animate-spin text-ink-dim" />}
      </div>
      {data.error && <p className="text-caption text-ink-dim">{data.error}</p>}

      {SECTIONS.map((section) => (
        <VocabularySection key={section.type} section={section} data={data} />
      ))}
    </section>
  )
}

function VocabularySection({
  section,
  data,
}: {
  section: (typeof SECTIONS)[number]
  data: UseParameterVocabularyResult
}) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [rowError, setRowError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const options = data.byType[section.type]
  const busy = removingId !== null

  // Deliberately NOT async, no busy/spinner state of its own (found in code
  // review: an earlier version wrapped this in `submittingAdd` + an
  // "Adding…" spinner, but `addOption` is fire-and-forget by design — rule
  // 6, local-first — so that state flipped true-then-false in the same
  // synchronous call, before the background RPC even started; the spinner
  // never rendered and the "busy" guard never actually blocked a second
  // submit). Matches `TileList`'s own "Add tile" flow exactly: the add
  // lands locally and instantly, so there's nothing to show a spinner FOR,
  // and the form is gone (replaced by the "Add option" button) in the same
  // tick a click could ever reach it a second time.
  function handleAdd(label: string) {
    setRowError(null)
    data.addOption(section.type, label)
    setDraft('')
    setAdding(false)
  }

  async function handleRemove(id: string, label: string) {
    if (busy) return
    // Never let this list empty out entirely — found in code review: every
    // activity's EFFECTIVE list for a type it hasn't customized resolves,
    // via inheritance, to "every option currently in this global list" (see
    // `internal.effective_parameter_option_ids`'s own doc comment) — a
    // global list of zero would mean every still-inheriting activity in the
    // app suddenly has NOTHING to pick from while logging, with no separate
    // "explicitly empty" state to distinguish it from "never provisioned"
    // (the same ambiguity the OLD per-activity model's own "can't narrow to
    // zero" guard existed to prevent, just one level up — at the shared list
    // itself rather than one activity's override of it).
    if (options.length <= 1) {
      setRowError(
        `Your ${section.label.toLowerCase()} list can’t be emptied — add a different option to replace “${label}” first.`,
      )
      return
    }
    setRowError(null)
    setRemovingId(id)
    try {
      const result = await data.removeOption(id)
      if (!result.ok) {
        setRowError(
          result.skipped
            ? `"${label}" has already been logged on a real activity — it can’t be removed.`
            : 'Could not remove this right now — try again once you’re back online.',
        )
      }
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-sm rounded-md border border-line-soft bg-surface p-md">
      <div>
        <h3 className="text-body font-semibold text-ink">{section.label}</h3>
        <p className="text-caption text-ink-dim">{section.helper}</p>
      </div>

      {data.status === 'ready' && options.length === 0 && (
        <p className="text-caption text-ink-dim">No options yet — add your first one below.</p>
      )}

      <ul className="flex flex-wrap gap-xs" aria-label={`${section.label} options`}>
        {options.map((option) => {
          const isRemoving = removingId === option.id
          return (
            <li key={option.id}>
              <Chip size="sm" tone="surface" className="gap-xs pr-xs">
                <span>{option.label}</span>
                <button
                  type="button"
                  aria-label={`Remove ${option.label}`}
                  onClick={() => void handleRemove(option.id, option.label)}
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

      {rowError && (
        <p role="alert" className="text-caption text-ink-dim">
          {rowError}
        </p>
      )}

      {adding ? (
        <form
          className="flex items-center gap-sm"
          onSubmit={(e) => {
            e.preventDefault()
            const trimmed = draft.trim()
            if (trimmed === '' || busy) return
            handleAdd(trimmed)
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
            Add
          </Button>
          <Button type="button" variant="ghost" size="inline" onClick={() => setAdding(false)} disabled={busy}>
            Cancel
          </Button>
        </form>
      ) : (
        <Button variant="outline" size="inline" onClick={() => setAdding(true)} disabled={busy} className="self-start px-md py-sm">
          <Plus aria-hidden="true" className="size-[13px]" />
          <span>Add option</span>
        </Button>
      )}
    </div>
  )
}
