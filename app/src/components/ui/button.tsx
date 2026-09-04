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
  'inline-flex items-center justify-center gap-sm font-sans transition-colors disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        /** The theme's invert fill. The single primary action in the editor. */
        primary:
          'bg-inv-bg text-inv-ink font-bold text-btn rounded-md hover:opacity-90 active:brightness-95',
        /** Text-only, no border. Secondary actions. */
        ghost: 'text-ink-dim font-semibold text-body rounded-md hover:text-ink',
        /**
         * Destructive text action — Remove. No colour any more (Section A) —
         * distinguished from `accent` by weight/underline only, same as
         * every other "no separate hue" pairing this retheme introduced.
         */
        destructive: 'text-ink-dim font-semibold text-caption rounded-sm hover:text-ink hover:underline underline-offset-2',
        /** Text action — Edit, Undo, breadcrumb back. */
        accent: 'text-ink-dim font-medium text-caption rounded-sm hover:text-ink hover:underline underline-offset-2',
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
