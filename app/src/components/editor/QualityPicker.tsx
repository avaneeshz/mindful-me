import { QUALITIES } from '@/data/activities'
import type { ActivityQuality } from '@/domain/types'
import { Chip } from '@/components/ui/chip'

const DEFAULT_QUALITY_OPTIONS: readonly string[] = QUALITIES.map((q) => q.id)

/**
 * "Activity quality" (formerly "How did it feel?") — multi-select, mirroring
 * `SymptomsPicker`'s pattern exactly: `role="group"` with each chip `role=
 * "checkbox"`/`aria-checked`, and clicking one only ever toggles itself —
 * never clears or mutually excludes a sibling.
 *
 * PICKER-CUSTOM-1: the option list is now per-activity and user-editable
 * (same as `FlagPicker` — see its own doc comment), so it's a prop, not a
 * hardcoded import; `options` defaults to the original static 18-value set.
 */
export function QualityPicker({
  selected,
  onToggle,
  options = DEFAULT_QUALITY_OPTIONS,
}: {
  selected: ActivityQuality[]
  onToggle: (quality: ActivityQuality) => void
  options?: readonly string[]
}) {
  return (
    <fieldset className="flex flex-col gap-sm">
      <legend className="text-entry-name font-semibold text-ink">Activity quality</legend>
      <div role="group" aria-label="Activity quality" className="flex flex-wrap gap-sm">
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
