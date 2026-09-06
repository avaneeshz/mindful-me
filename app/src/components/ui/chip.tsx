import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * The pill-chip primitive, extracted from the prototype's `.pill-btn` and
 * `.lib-pill` (which were two copies of the same visual idea).
 *
 * One component now serves: header utility pills, activity sub-option chips,
 * and — extended, not re-invented — the Day/Night period navigator segments.
 */
const chipVariants = cva(
  'inline-flex items-center gap-sm rounded-full border font-sans transition-colors',
  {
    variants: {
      tone: {
        /** Resting: the theme's own surface, hairline border. */
        surface: 'bg-surface border-line text-ink',
        /** Selected / focused: the theme's invert pair — never a new hue. */
        active: 'bg-inv-bg border-inv-bg text-inv-ink',
        /** Sits inside an already-surface-toned track, so it carries no border. */
        bare: 'bg-transparent border-transparent text-ink',
      },
      size: {
        /** Header utility pills. */
        sm: 'h-header px-md text-note font-semibold',
        /** Touch-comfortable option chips and segments. */
        md: 'h-control px-lg text-body font-semibold',
        /** Segment inside the 44px navigator track (44 − 2×4 padding). */
        segment: 'h-segment px-lg text-body font-semibold',
        /**
         * Compact option chips for dense multi-option rows (the log-activity
         * modal's Activity quality / Protective response / Chronic Symptoms
         * pickers) — `sm` at 40px/12px padding read too large once those
         * rows grew to 14-18 options. No height token on the shared scale
         * goes below `segment`'s 36px, and this is a one-off UI-density
         * value rather than a dimension the spec names elsewhere, so it's an
         * arbitrary value here instead of a new entry on that scale.
         */
        xs: 'h-[32px] px-sm text-caption font-semibold',
      },
      interactive: {
        true: 'cursor-pointer',
        false: '',
      },
    },
    compoundVariants: [
      { tone: 'surface', interactive: true, class: 'hover:border-ink' },
      { tone: 'bare', interactive: true, class: 'hover:bg-bg' },
    ],
    defaultVariants: { tone: 'surface', size: 'md', interactive: false },
  },
)

export interface ChipProps
  extends Omit<React.HTMLAttributes<HTMLElement>, 'color'>,
    VariantProps<typeof chipVariants> {
  as?: 'div' | 'span' | 'button'
}

export function Chip({ as = 'div', className, tone, size, interactive, ...props }: ChipProps) {
  const Comp = as as React.ElementType
  return (
    <Comp
      className={cn(chipVariants({ tone, size, interactive }), className)}
      {...(as === 'button' ? { type: 'button' } : {})}
      {...props}
    />
  )
}

export { chipVariants }
