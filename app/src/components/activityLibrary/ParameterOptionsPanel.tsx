import { useState } from 'react'
import { Loader2, Plus, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { fieldClass } from '@/components/ui/formField'
import type { ParameterType } from '@/api/parameterOptions'
import type { UseParameterOptionsResult } from '@/state/useParameterOptions'
import { useParameterSectionEditor } from '@/state/useParameterSectionEditor'

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
  const { overridden, effective, busy, pendingAction, removingLabel, rowError, remove: handleRemove, add, reset: handleReset } =
    useParameterSectionEditor(section, activityName, data)

  async function handleAdd(label: string) {
    if (await add(label)) {
      setDraft('')
      setAdding(false)
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
