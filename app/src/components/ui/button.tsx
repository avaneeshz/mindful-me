import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * shadcn/ui Button, retheme to the Ritual Board design system.
 *
 * Only the variants this screen actually uses are defined — the picker tile,
 * timeline slot and flag toggle are genuinely different interaction patterns
 * and are built as their own components rather than bent into this one.
 *
 * The focus ring is intentionally NOT declared here: a single product-wide
 * :focus-visible rule in styles/index.css owns that treatment.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-sm font-sans transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        /** Primary action with refined styling */
        primary:
          'bg-inv-bg text-inv-ink font-bold text-btn rounded-lg hover:shadow-elevation-2 hover:scale-105 active:scale-95 border border-transparent hover:border-inv-ink/10',
        /** Text-only, no border. Secondary actions. */
        ghost: 'text-ink-dim font-semibold text-body rounded-md hover:text-ink hover:bg-surface-2/40 transition-all',
        /** Bordered, surface-toned with refined styling */
        outline:
          'border border-line-soft bg-surface-2/40 text-ink font-semibold text-btn rounded-lg transition-all hover:border-line hover:bg-surface-2/60 hover:shadow-elevation-1',
        /**
         * Destructive text action — Remove, with semantic styling
         */
        destructive: 'text-ink-dim font-semibold text-caption rounded-sm hover:text-accent-warm hover:underline underline-offset-2 transition-all',
        /** Text action — Edit, Undo, breadcrumb back. */
        accent: 'text-ink-dim font-medium text-caption rounded-sm hover:text-accent-primary hover:underline underline-offset-2 transition-all',
      },
      size: {
        /** 44px — the standard touch target height. */
        control: 'h-control px-lg',
        /** Intrinsic height, for inline text actions inside list rows. */
        inline: 'px-0 py-xs',
      },
      block: {
        true: 'w-full',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'control',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, asChild = false, type = 'button', ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : type}
        className={cn(buttonVariants({ variant, size, block }), className)}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
