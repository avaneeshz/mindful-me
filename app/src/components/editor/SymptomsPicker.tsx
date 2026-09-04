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
 */
export function SymptomsPicker({
  selected,
  onToggle,
}: {
  selected: Symptom[]
  onToggle: (symptom: Symptom) => void
}) {
  return (
    <fieldset className="flex flex-col gap-sm">
      <legend className="text-caption font-semibold text-ink-dim">Chronic Symptoms</legend>
      <div role="group" aria-label="Chronic Symptoms" className="flex flex-wrap gap-sm">
        {SYMPTOMS.map((symptom) => {
          const isSelected = selected.includes(symptom.id)
          const Icon = symptom.icon
          return (
            <Chip
              key={symptom.id}
              as="button"
              size="md"
              tone={isSelected ? 'active' : 'surface'}
              interactive
              role="checkbox"
              aria-checked={isSelected}
              onClick={() => onToggle(symptom.id)}
            >
              <Icon aria-hidden="true" className="size-[16px]" />
              {symptom.id}
            </Chip>
          )
        })}
      </div>
    </fieldset>
  )
}
