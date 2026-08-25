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
        /** Resting: white surface, hairline border. */
        surface: 'bg-white border-line text-charcoal',
        /** Selected / focused: Deep Forest fill. */
        active: 'bg-forest border-forest text-white',
        /** Sits inside an already-white track, so it carries no border. */
        bare: 'bg-transparent border-transparent text-charcoal',
      },
      size: {
        /** Header utility pills. */
        sm: 'h-header px-md text-note font-semibold',
        /** Touch-comfortable option chips and segments. */
        md: 'h-control px-lg text-body font-semibold',
        /** Segment inside the 44px navigator track (44 − 2×4 padding). */
        segment: 'h-segment px-lg text-body font-semibold',
      },
      interactive: {
        true: 'cursor-pointer',
        false: '',
      },
    },
    compoundVariants: [
      { tone: 'surface', interactive: true, class: 'hover:border-forest-light' },
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
