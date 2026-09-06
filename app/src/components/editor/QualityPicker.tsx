import { QUALITIES } from '@/data/activities'
import type { ActivityQuality } from '@/domain/types'
import { Chip } from '@/components/ui/chip'

/**
 * "Activity quality" (formerly "How did it feel?") — SCRUM-10 replaced the
 * old 5-value single-select vocabulary with an 18-value one and made this
 * field multi-select, mirroring `SymptomsPicker`'s pattern exactly: `role=
 * "group"` with each chip `role="checkbox"`/`aria-checked`, and clicking one
 * only ever toggles itself — never clears or mutually excludes a sibling.
 *
 * Configuration screen ask #4 — `allowedIds`, when set, restricts this to the
 * currently-staged activity's own allow-list subset of the 18-value master
 * list (`CatalogContext.attributeOverrides`); `undefined` (no override) shows
 * every master value, exactly today's behaviour. The master vocabulary itself
 * (`QUALITIES`) is never user-editable — only which of its values apply here.
 */
export function QualityPicker({
  selected,
  allowedIds,
  onToggle,
}: {
  selected: ActivityQuality[]
  allowedIds?: string[]
  onToggle: (quality: ActivityQuality) => void
}) {
  const options = allowedIds ? QUALITIES.filter((quality) => allowedIds.includes(quality.id)) : QUALITIES
  return (
    <fieldset className="flex flex-col gap-sm">
      <legend className="text-entry-name font-semibold text-ink">Activity quality</legend>
      {options.length === 0 ? (
        <p className="text-caption text-ink-dim">
          No activity quality options are configured for this activity.
        </p>
      ) : (
        <div role="group" aria-label="Activity quality" className="flex flex-wrap gap-sm">
          {options.map((quality) => {
            const isSelected = selected.includes(quality.id)
            return (
              <Chip
                key={quality.id}
                as="button"
                size="xs"
                tone={isSelected ? 'active' : 'surface'}
                interactive
                role="checkbox"
                aria-checked={isSelected}
                onClick={() => onToggle(quality.id)}
              >
                {quality.id}
              </Chip>
            )
          })}
        </div>
      )}
    </fieldset>
  )
}
