import { FLAGS } from '@/data/activities'
import type { FlagId } from '@/domain/types'
import { Chip } from '@/components/ui/chip'

const DEFAULT_FLAG_OPTIONS: readonly string[] = FLAGS.map((f) => f.id)

/**
 * Single-select "Protective response" row (formerly "Flag") inside the
 * log-activity modal (Modal Redesign §E). Flags attach to the specific
 * activity being logged, not a whole 30-minute slot — replaces the old
 * always-multi-select `FlagsRow` in `SlotEditor`'s header, which is deleted
 * (nothing creates a flag-only marker any more; legacy marker rows still
 * read/render exactly as before, untouched, via `domain/slots.ts`
 * `flagMarkerAt`).
 *
 * SCRUM-15 replaced the original 4-value option set with a 14-value one
 * (`FlagId` in domain/types.ts) and dropped icons from every chip in this
 * section — text-only, since the option list is long enough now that icons
 * and full-size text cost too much space.
 *
 * There is no dedicated "None" chip — clearing the selection is done by
 * re-clicking the currently active flag chip, which already toggles it off
 * (`onSelect(isSelected ? null : option)` below).
 *
 * PICKER-CUSTOM-1: the option list is now per-activity and user-editable
 * (`public.activity_parameter_options`, inherited — see `internal.
 * effective_parameter_options`'s own doc comment), so it's a prop now,
 * never a hardcoded import — `options` defaults to the original static
 * 14-value set so every existing call site (and every test) that doesn't
 * pass one keeps behaving exactly as before.
 */
export function FlagPicker({
  selected,
  onSelect,
  options = DEFAULT_FLAG_OPTIONS,
}: {
  selected: FlagId | null
  onSelect: (flag: FlagId | null) => void
  options?: readonly string[]
}) {
  return (
    <fieldset className="flex flex-col gap-sm">
      <legend className="text-entry-name font-semibold text-ink">Protective response</legend>
      <div role="radiogroup" aria-label="Protective response" className="flex flex-wrap gap-sm">
        {options.map((option) => {
          const isSelected = selected === option
          return (
            <Chip
              key={option}
              as="button"
              size="xs"
              tone={isSelected ? 'active' : 'surface'}
              interactive
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(isSelected ? null : option)}
            >
              {option}
            </Chip>
          )
        })}
      </div>
    </fieldset>
  )
}
