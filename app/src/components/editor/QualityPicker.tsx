import { QUALITIES } from '@/data/activities'
import type { ActivityQuality } from '@/domain/types'
import { Chip } from '@/components/ui/chip'

/**
 * "How did it feel?" (Modal Redesign §D) — single-select, optional. Mirrors
 * `FlagPicker`'s visual pattern deliberately (same "pick one of a small set
 * of labeled icon chips" vocabulary across both single-select rows in this
 * modal), including an explicit clear affordance: re-selecting the active
 * chip clears it back to null, same as tapping "None" does for flags.
 */
export function QualityPicker({
  selected,
  onSelect,
}: {
  selected: ActivityQuality | null
  onSelect: (quality: ActivityQuality | null) => void
}) {
  return (
    <fieldset className="flex flex-col gap-sm">
      <legend className="text-caption font-semibold text-muted">How did it feel?</legend>
      <div role="radiogroup" aria-label="How did it feel?" className="flex flex-wrap gap-sm">
        {QUALITIES.map((quality) => {
          const isSelected = selected === quality.id
          const Icon = quality.icon
          return (
            <Chip
              key={quality.id}
              as="button"
              size="md"
              tone={isSelected ? 'active' : 'surface'}
              interactive
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(isSelected ? null : quality.id)}
            >
              <Icon aria-hidden="true" className="size-[16px]" />
              {quality.id}
            </Chip>
          )
        })}
      </div>
    </fieldset>
  )
}
