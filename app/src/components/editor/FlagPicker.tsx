import { Ban } from 'lucide-react'
import { FLAGS } from '@/data/activities'
import type { FlagId } from '@/domain/types'
import { Chip } from '@/components/ui/chip'

/**
 * Single-select flag row inside the log-activity modal (Modal Redesign §E).
 * Flags now attach to the specific activity being logged, not a whole
 * 30-minute slot — replaces the old always-multi-select `FlagsRow` in
 * `SlotEditor`'s header, which is deleted (nothing creates a flag-only
 * marker any more; legacy marker rows still read/render exactly as before,
 * untouched, via `domain/slots.ts` `flagMarkerAt`).
 *
 * "None" is a real 5th chip, not an implicit empty state — selecting it (or
 * re-selecting the currently active flag) clears the selection.
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
      <legend className="text-caption font-semibold text-muted">Flag</legend>
      <div role="radiogroup" aria-label="Flag" className="flex flex-wrap gap-sm">
        <Chip
          as="button"
          size="md"
          tone={selected === null ? 'active' : 'surface'}
          interactive
          role="radio"
          aria-checked={selected === null}
          onClick={() => onSelect(null)}
        >
          <Ban aria-hidden="true" className="size-[16px]" />
          None
        </Chip>
        {FLAGS.map((flag) => {
          const isSelected = selected === flag.id
          const Icon = flag.icon
          return (
            <Chip
              key={flag.id}
              as="button"
              size="md"
              tone={isSelected ? 'active' : 'surface'}
              interactive
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(isSelected ? null : flag.id)}
            >
              <Icon aria-hidden="true" className="size-[16px]" />
              {flag.shortLabel}
            </Chip>
          )
        })}
      </div>
    </fieldset>
  )
}
