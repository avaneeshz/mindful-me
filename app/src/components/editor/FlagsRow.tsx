import { FLAGS } from '@/data/activities'
import type { FlagId } from '@/domain/types'
import { cn } from '@/lib/utils'

interface FlagsRowProps {
  activeFlags: readonly FlagId[]
  onToggle: (flag: FlagId) => void
}

/**
 * Whole-slot markers. BEHAVIOUR IS FROZEN this pass: instant toggle, no
 * duration, all three can be on at once, and they never consume slot capacity.
 * Only the presentation changed — 44×44 touch targets, Lucide icons, and a
 * caption that is always visible on touch instead of a hover-only tooltip.
 */
export function FlagsRow({ activeFlags, onToggle }: FlagsRowProps) {
  return (
    <div role="group" aria-label="Slot markers" className="flex gap-sm">
      {FLAGS.map(({ id, shortLabel, icon: Icon }) => {
        const isOn = activeFlags.includes(id)
        return (
          <div key={id} className="group flex flex-col items-center gap-xs">
            <button
              type="button"
              aria-pressed={isOn}
              aria-label={id}
              onClick={() => onToggle(id)}
              className={cn(
                'flex size-flag items-center justify-center rounded-md border-1.5 transition-colors',
                isOn
                  ? 'border-terracotta bg-terracotta text-white'
                  : 'border-line bg-white text-charcoal hover:border-forest-light',
              )}
            >
              <Icon aria-hidden="true" className="size-[18px]" />
            </button>
            {/*
              One element, two behaviours: an always-visible caption where hover
              does not exist, a hover/focus tooltip where it does.
            */}
            <span
              aria-hidden="true"
              className={cn(
                'text-nano font-bold text-muted transition-opacity',
                'hoverable:opacity-0 hoverable:group-hover:opacity-100 hoverable:group-focus-within:opacity-100',
              )}
            >
              {shortLabel}
            </span>
          </div>
        )
      })}
    </div>
  )
}
