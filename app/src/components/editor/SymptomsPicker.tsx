import { SYMPTOMS } from '@/data/activities'
import type { Symptom } from '@/domain/types'
import { Chip } from '@/components/ui/chip'

/**
 * "Chronic Symptoms" — a NEW multi-select, optional row between Activity
 * quality and Protective response. Unlike those two (single-select, `role=
 * "radiogroup"`/`radio`), any number of these can be selected at once, so
 * this is a real checkbox group instead: `role="group"` with each chip
 * `role="checkbox"`/`aria-checked`, and clicking one only ever toggles
 * itself — never clears a sibling the way the single-select pickers do.
 *
 * `allowedIds` — see `QualityPicker`'s own doc comment; same allow-list
 * contract (`undefined` = every master symptom, per-activity override
 * otherwise), same master vocabulary (`SYMPTOMS`) staying fixed either way.
 */
export function SymptomsPicker({
  selected,
  allowedIds,
  onToggle,
}: {
  selected: Symptom[]
  allowedIds?: string[]
  onToggle: (symptom: Symptom) => void
}) {
  const options = allowedIds ? SYMPTOMS.filter((symptom) => allowedIds.includes(symptom.id)) : SYMPTOMS
  return (
    <fieldset className="flex flex-col gap-sm">
      <legend className="text-entry-name font-semibold text-ink">Chronic Symptoms</legend>
      {options.length === 0 ? (
        <p className="text-caption text-ink-dim">No chronic symptom options are configured for this activity.</p>
      ) : (
        <div role="group" aria-label="Chronic Symptoms" className="flex flex-wrap gap-sm">
          {options.map((symptom) => {
            const isSelected = selected.includes(symptom.id)
            return (
              <Chip
                key={symptom.id}
                as="button"
                size="xs"
                tone={isSelected ? 'active' : 'surface'}
                interactive
                role="checkbox"
                aria-checked={isSelected}
                onClick={() => onToggle(symptom.id)}
              >
                {symptom.id}
              </Chip>
            )
          })}
        </div>
      )}
    </fieldset>
  )
}
