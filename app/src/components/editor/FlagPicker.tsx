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
 * section — text-only, since the option list is long enough now that icons
 * and full-size text cost too much space.
 *
 * There is no dedicated "None" chip — clearing the selection is done by
 * re-clicking the currently active flag chip, which already toggles it off
 * (`onSelect(isSelected ? null : flag.id)` below).
 */
export function FlagPicker({
  selected,
  allowedIds,
  onSelect,
}: {
  selected: FlagId | null
  /** See `QualityPicker`'s own doc comment — same allow-list contract, same fixed master vocabulary. */
  allowedIds?: string[]
  onSelect: (flag: FlagId | null) => void
}) {
  const options = allowedIds ? FLAGS.filter((flag) => allowedIds.includes(flag.id)) : FLAGS
  return (
    <fieldset className="flex flex-col gap-sm">
      <legend className="text-entry-name font-semibold text-ink">Protective response</legend>
      {options.length === 0 ? (
        <p className="text-caption text-ink-dim">No protective response options are configured for this activity.</p>
      ) : (
        <div role="radiogroup" aria-label="Protective response" className="flex flex-wrap gap-sm">
          {options.map((flag) => {
            const isSelected = selected === flag.id
            return (
              <Chip
                key={flag.id}
                as="button"
                size="xs"
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
        </div>
      )}
    </fieldset>
  )
}
