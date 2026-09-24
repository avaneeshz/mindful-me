import { Chip } from '@/components/ui/chip'
import { cn } from '@/lib/utils'

/**
 * One multiselect-kind `header_button_note_fields` row's picker — generalizes
 * the old hardcoded `SleepQualityPicker` (Sleep's "How was your sleep?" was
 * the one and only multiselect field this app had) to ANY activity button's
 * ANY number of user-defined multiselect fields. Mirrors `QualityPicker`'s
 * exact shape/interaction (`role="group"`, each chip `role="checkbox"`,
 * toggling one never clears or mutually excludes a sibling) — the same
 * structurally-identical control, just driven by config instead of a
 * hardcoded vocabulary now.
 */
export function MultiselectFieldPicker({
  label,
  options,
  selected,
  onToggle,
  compact,
}: {
  label: string
  options: readonly string[]
  selected: readonly string[]
  onToggle: (value: string) => void
  /**
   * `LogActivityModal`'s full-size editor sizes this legend like its sibling
   * pickers (Activity quality/Symptoms/Flag) — `text-entry-name`. The header
   * quick-log popover (`DisplayValueButton`) is a much narrower, denser
   * surface where that size read oversized next to its own captions
   * (`text-caption`), so it opts into this smaller variant instead — see
   * the old `SleepQualityPicker`'s own doc comment for the same reasoning.
   */
  compact?: boolean
}) {
  if (options.length === 0) return null
  return (
    <fieldset className="flex flex-col gap-sm">
      <legend className={cn('font-semibold', compact ? 'text-caption text-ink-dim' : 'text-entry-name text-ink')}>
        {label}
      </legend>
      <div role="group" aria-label={label} className="flex flex-wrap gap-sm">
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
