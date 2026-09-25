import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'ghost' | 'quiet' | 'primary' | 'active'
type Size = 'icon' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  // Default control: flat translucent surface, hairline border.
  quiet:
    'bg-surface-1/70 border border-line/[0.09] text-ink hover:bg-surface-2 hover:border-line/[0.14] active:bg-surface-3/80',
  ghost: 'text-ink-muted hover:text-ink hover:bg-white/[0.04] active:bg-white/[0.07]',
  primary:
    'bg-accent text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_8px_20px_-8px_rgb(var(--accent)/0.7)] hover:brightness-110 active:brightness-95',
  // A toggled-on control (e.g. an enabled integration).
  active:
    'bg-mint/[0.08] border border-mint/40 text-mint shadow-[0_0_0_4px_rgb(var(--mint)/0.06)] hover:bg-mint/[0.12]',
}

const sizes: Record<Size, string> = {
  icon: 'h-11 w-11 rounded-full',
  md: 'h-11 px-4 gap-2 rounded-full text-sm font-medium',
  lg: 'h-12 px-5 gap-2 rounded-full text-base font-medium',
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'quiet', size = 'md', className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-[background-color,border-color,color,filter,transform] duration-150 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 [&_svg]:shrink-0',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  )
})
