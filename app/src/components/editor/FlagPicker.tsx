import { FLAGS } from '@/data/activities'
import type { FlagId } from '@/domain/types'
import { Chip } from '@/components/ui/chip'

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
 * section — text-only, smaller (`size="sm"`), since the option list is long
 * enough now that icons and full-size text cost too much space.
 *
 * "None" is a real chip, not an implicit empty state — selecting it (or
 * re-selecting the currently active flag) clears the selection. Ordered
 * LAST, after all 14 options.
 */
export function FlagPicker({
  selected,
  onSelect,
}: {
  selected: FlagId | null
  onSelect: (flag: FlagId | null) => void
}) {
  return (
    <fieldset className="flex flex-col gap-sm">
      <legend className="text-caption font-semibold text-ink-dim">Protective response</legend>
      <div role="radiogroup" aria-label="Protective response" className="flex flex-wrap gap-sm">
        {FLAGS.map((flag) => {
          const isSelected = selected === flag.id
          return (
            <Chip
              key={flag.id}
              as="button"
              size="sm"
              tone={isSelected ? 'active' : 'surface'}
              interactive
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(isSelected ? null : flag.id)}
            >
              {flag.id}
            </Chip>
          )
        })}
        <Chip
          as="button"
          size="sm"
          tone={selected === null ? 'active' : 'surface'}
          interactive
          role="radio"
          aria-checked={selected === null}
          onClick={() => onSelect(null)}
        >
          None
        </Chip>
      </div>
    </fieldset>
  )
}
