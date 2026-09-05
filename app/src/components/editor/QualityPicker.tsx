import { QUALITIES } from '@/data/activities'
import type { ActivityQuality } from '@/domain/types'
import { Chip } from '@/components/ui/chip'

/**
 * "Activity quality" (formerly "How did it feel?") — SCRUM-10 replaced the
 * old 5-value single-select vocabulary with an 18-value one and made this
 * field multi-select, mirroring `SymptomsPicker`'s pattern exactly: `role=
 * "group"` with each chip `role="checkbox"`/`aria-checked`, and clicking one
 * only ever toggles itself — never clears or mutually excludes a sibling.
 */
export function QualityPicker({
  selected,
  onToggle,
}: {
  selected: ActivityQuality[]
  onToggle: (quality: ActivityQuality) => void
}) {
  return (
    <fieldset className="flex flex-col gap-sm">
      <legend className="text-caption font-semibold text-ink-dim">Activity quality</legend>
      <div role="group" aria-label="Activity quality" className="flex flex-wrap gap-sm">
        {QUALITIES.map((quality) => {
          const isSelected = selected.includes(quality.id)
          const Icon = quality.icon
          return (
            <Chip
              key={quality.id}
              as="button"
              size="md"
              tone={isSelected ? 'active' : 'surface'}
              interactive
              role="checkbox"
              aria-checked={isSelected}
              onClick={() => onToggle(quality.id)}
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
