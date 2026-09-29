import { SYMPTOMS } from '@/data/activities'
import type { Symptom } from '@/domain/types'
import { Chip } from '@/components/ui/chip'

const DEFAULT_SYMPTOM_OPTIONS: readonly string[] = SYMPTOMS.map((s) => s.id)

/**
 * "Chronic Symptoms" — a multi-select, optional row between Activity quality
 * and Protective response. Unlike those two (single-select, `role=
 * "radiogroup"`/`radio`), any number of these can be selected at once, so
 * this is a real checkbox group instead: `role="group"` with each chip
 * `role="checkbox"`/`aria-checked`, and clicking one only ever toggles
 * itself — never clears a sibling the way the single-select pickers do.
 *
 * PICKER-CUSTOM-1: the option list is now per-activity and user-editable
 * (same as `FlagPicker`/`QualityPicker` — see `FlagPicker`'s own doc
 * comment), so it's a prop, not a hardcoded import; `options` defaults to
 * the original static 6-value set.
 */
export function SymptomsPicker({
  selected,
  onToggle,
  options = DEFAULT_SYMPTOM_OPTIONS,
}: {
  selected: Symptom[]
  onToggle: (symptom: Symptom) => void
  options?: readonly string[]
}) {
  return (
    <fieldset className="flex flex-col gap-sm">
      <legend className="text-entry-name font-semibold text-ink">Chronic Symptoms</legend>
      <div role="group" aria-label="Chronic Symptoms" className="flex flex-wrap gap-sm">
        {options.map((option) => {
          const isSelected = selected.includes(option)
          return (
            <Chip
              key={option}
              as="button"
              size="xs"
              tone={isSelected ? 'active' : 'surface'}
              interactive
              role="checkbox"
              aria-checked={isSelected}
              onClick={() => onToggle(option)}
            >
              {option}
            </Chip>
          )
        })}
      </div>
    </fieldset>
  )
}
