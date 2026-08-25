import { Chip } from '@/components/ui/chip'
import { PERIOD_ICONS, PERIOD_LABELS } from '@/data/periods'
import { cn } from '@/lib/utils'
import type { Period } from '@/domain/types'

interface PeriodNavigatorProps {
  focusedPeriod: Period
  /** Scrolls the matching row into view and pulses it. Never changes selection. */
  onJump: (period: Period) => void
}

/**
 * A JUMP-TO-PERIOD NAVIGATOR — not an exclusive toggle and not a filter.
 *
 * Both timeline rows remain fully visible and fully interactive at all times.
 * The focused styling lives on the segment button only; it is deliberately
 * never propagated to the rows as opacity, dimming or disabling. It also does
 * not change which slot the editor is showing.
 *
 * Built by extending the shared Chip primitive rather than inventing a new
 * control: the track is a Chip-shaped surface, the segments are bare Chips.
 */
export function PeriodNavigator({ focusedPeriod, onJump }: PeriodNavigatorProps) {
  return (
    <nav aria-label="Jump to a period of the day" aria-describedby="period-nav-hint">
      <p id="period-nav-hint" className="sr-only">
        Jumping scrolls that part of the timeline into view. Both the day and night
        timelines stay visible and usable.
      </p>
      <div className="inline-flex h-control items-center gap-xs rounded-full border border-line bg-white p-xs mobile:flex mobile:w-full">
        {(['day', 'night'] as const).map((period) => {
          const Icon = PERIOD_ICONS[period]
          const isFocused = focusedPeriod === period
          return (
            <Chip
              key={period}
              as="button"
              size="segment"
              tone={isFocused ? 'active' : 'bare'}
              interactive
              onClick={() => onJump(period)}
              aria-current={isFocused ? 'location' : undefined}
              className={cn('whitespace-nowrap mobile:flex-1 mobile:justify-center')}
            >
              <Icon aria-hidden="true" className="size-[14px] shrink-0" />
              {PERIOD_LABELS[period]}
            </Chip>
          )
        })}
      </div>
    </nav>
  )
}
