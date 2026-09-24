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

  const overridden = data.isOverridden[section.type]
  const effective = data.effective[section.type]
  const own = data.own[section.type]

  async function handleDelete(id: string, label: string) {
    setRowError(null)
    const result = await data.deleteOption(id, section.type)
    if (!result.ok) {
      setRowError(
        result.reason === 'has_history'
          ? `"${label}" has already been logged on a real activity — it can’t be removed.`
          : 'Could not remove this right now — try again once you’re back online.',
      )
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
          const ownRow = own.find((o) => o.label === option.label)
          return (
            <li key={option.label}>
              <Chip size="sm" tone="surface" className="gap-xs pr-xs">
                <span>{option.label}</span>
                {ownRow && (
                  <button
                    type="button"
                    aria-label={`Remove ${option.label}`}
                    onClick={() => void handleDelete(ownRow.id, option.label)}
                    className="flex size-[16px] items-center justify-center rounded-full text-ink-dim hover:text-ink"
                  >
                    <X aria-hidden="true" className="size-[10px]" />
                  </button>
                )}
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
              if (draft.trim() === '') return
              data.addOption(section.type, draft.trim())
              setDraft('')
              setAdding(false)
            }}
          >
            <input
              autoFocus
              className={fieldClass}
              placeholder="New option"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label={`New ${section.label} option`}
            />
            <Button type="submit" size="inline" disabled={draft.trim() === ''}>
              Add
            </Button>
            <Button type="button" variant="ghost" size="inline" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <Button variant="outline" size="inline" onClick={() => setAdding(true)} className="px-md py-sm">
            <Plus aria-hidden="true" className="size-[13px]" />
            <span>Add option</span>
          </Button>
        )}

        {activityName !== null && overridden && (
          <Button variant="ghost" size="inline" onClick={() => void data.resetToInherited(section.type)}>
            <RotateCcw aria-hidden="true" className="size-[13px]" />
            <span>Reset to inherited</span>
          </Button>
        )}
      </div>
    </div>
  )
}
