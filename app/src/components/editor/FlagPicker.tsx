import { FLAGS } from '@/data/activities'
import type { FlagId } from '@/domain/types'
import { Chip } from '@/components/ui/chip'

const DEFAULT_FLAG_OPTIONS: readonly string[] = FLAGS.map((f) => f.id)

/**
 * "Protective response" — a multi-select, optional row inside the
 * log-activity modal, behaving exactly like `SymptomsPicker` /
 * `QualityPicker`: a checkbox group where clicking a chip only ever toggles
 * itself. There is no "None" chip — nothing selected is none. Flags attach
 * to the specific activity being logged, not a whole 30-minute slot.
 *
 * The option list is user-editable (PICKER-CUSTOM-1), so it is a prop;
 * `options` defaults to the original static set so call sites and tests that
 * don't pass one keep working.
 */
export function FlagPicker({
  selected,
  onToggle,
  options = DEFAULT_FLAG_OPTIONS,
}: {
  selected: FlagId[]
  onToggle: (flag: FlagId) => void
  options?: readonly string[]
}) {
  return (
    <fieldset className="flex flex-col gap-sm">
      <legend className="text-entry-name font-semibold text-ink">Protective response</legend>
      <div role="group" aria-label="Protective response" className="flex flex-wrap gap-sm">
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
