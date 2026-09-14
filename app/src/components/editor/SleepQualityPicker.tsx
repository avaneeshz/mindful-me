import { SLEEP_QUALITIES } from '@/data/activities'
import type { SleepQualityId } from '@/domain/types'
import { Chip } from '@/components/ui/chip'
import { cn } from '@/lib/utils'

/**
 * "How was your sleep?" — Sleep-quick-log-only in practice (the modal only
 * renders this when `staging.cardName === 'Sleep'`; see `LogActivityModal`).
 * Its OWN 11-value vocabulary, deliberately separate from `QualityPicker`'s
 * 18-value "Activity quality" — mirrors that component's exact
 * shape/interaction (`role="group"`, each chip `role="checkbox"`, toggling
 * one never clears or mutually excludes a sibling) rather than inventing a
 * new pattern for what is structurally the same control.
 */
export function SleepQualityPicker({
  selected,
  onToggle,
  compact,
}: {
  selected: SleepQualityId[]
  onToggle: (quality: SleepQualityId) => void
  /**
   * `LogActivityModal`'s full-size editor sizes this legend like its sibling
   * pickers (Activity quality/Symptoms/Flag) — `text-entry-name`. The header
   * quick-log popover (`DisplayValueButton`) is a much narrower, denser
   * surface where that size read oversized next to its own captions
   * (`text-caption`), so it opts into this smaller variant instead.
   */
  compact?: boolean
}) {
  return (
    <fieldset className="flex flex-col gap-sm">
      <legend className={cn('font-semibold', compact ? 'text-caption text-ink-dim' : 'text-entry-name text-ink')}>
        How was your sleep?
      </legend>
      <div role="group" aria-label="How was your sleep?" className="flex flex-wrap gap-sm">
        {SLEEP_QUALITIES.map((quality) => {
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
    </fieldset>
  )
}
