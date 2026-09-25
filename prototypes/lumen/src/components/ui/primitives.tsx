import * as RPopover from '@radix-ui/react-popover'
import { AnimatePresence, motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { hueStyles, type Hue } from '@/lib/data'
import type { LucideIcon } from 'lucide-react'

/* ——— Popover ——— */

export function Popover({
  trigger,
  children,
  align = 'start',
  className,
  open: controlledOpen,
  onOpenChange,
}: {
  trigger: ReactNode
  children: ReactNode | ((close: () => void) => ReactNode)
  align?: 'start' | 'center' | 'end'
  className?: string
  open?: boolean
  onOpenChange?: (o: boolean) => void
}) {
  const [innerOpen, setInnerOpen] = useState(false)
  const open = controlledOpen ?? innerOpen
  const setOpen = (o: boolean) => {
    setInnerOpen(o)
    onOpenChange?.(o)
  }
  return (
    <RPopover.Root open={open} onOpenChange={setOpen}>
      <RPopover.Trigger asChild>{trigger}</RPopover.Trigger>
      <AnimatePresence>
        {open && (
          <RPopover.Portal forceMount>
            <RPopover.Content asChild forceMount align={align} sideOffset={10} collisionPadding={16}>
              <motion.div
                className={cn(
                  'z-50 rounded-card border border-line/10 bg-surface-2 p-2 shadow-raised outline-none',
                  className,
                )}
                initial={{ opacity: 0, y: -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                style={{ transformOrigin: 'var(--radix-popover-content-transform-origin)' }}
              >
                {typeof children === 'function' ? children(() => setOpen(false)) : children}
              </motion.div>
            </RPopover.Content>
          </RPopover.Portal>
        )}
      </AnimatePresence>
    </RPopover.Root>
  )
}

export function MenuItem({
  icon: Icon,
  children,
  hint,
  onSelect,
}: {
  icon?: LucideIcon
  children: ReactNode
  hint?: ReactNode
  onSelect?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-left text-sm text-ink transition-colors hover:bg-white/[0.05] active:bg-white/[0.08]"
    >
      {Icon && <Icon className="h-4 w-4 text-ink-muted" />}
      <span className="flex-1">{children}</span>
      {hint && <span className="text-xs text-ink-faint">{hint}</span>}
    </button>
  )
}

/* ——— Icon bubble: the one way category/metric icons are presented ——— */

export function IconBubble({
  icon: Icon,
  hue,
  size = 'md',
  className,
}: {
  icon: LucideIcon
  hue: Hue
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const s = hueStyles[hue]
  const dims = { sm: 'h-8 w-8 [&_svg]:h-4 [&_svg]:w-4', md: 'h-10 w-10 [&_svg]:h-5 [&_svg]:w-5', lg: 'h-12 w-12 [&_svg]:h-6 [&_svg]:w-6' }[size]
  return (
    <span className={cn('relative grid shrink-0 place-items-center rounded-full', s.bubble, dims, className)}>
      <Icon className={s.icon} strokeWidth={1.8} />
    </span>
  )
}

/* ——— Progress ——— */

export function ProgressBar({ value, className, tone = 'mint' }: { value: number; className?: string; tone?: 'mint' | 'accent' }) {
  const pct = Math.max(0, Math.min(1, value))
  return (
    <div className={cn('relative h-1.5 overflow-hidden rounded-full bg-white/[0.06]', className)}>
      <motion.div
        className={cn('absolute inset-y-0 left-0 rounded-full', tone === 'mint' ? 'bg-mint' : 'bg-accent-ink')}
        initial={false}
        animate={{ width: `${Math.max(pct * 100, pct > 0 ? 3 : 0)}%` }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  )
}

export function ProgressRing({
  value,
  size = 44,
  stroke = 3,
  className,
  children,
  complete,
}: {
  value: number
  size?: number
  stroke?: number
  className?: string
  children?: ReactNode
  complete?: boolean
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(1, value))
  return (
    <span className={cn('relative grid shrink-0 place-items-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(255 255 255 / 0.07)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={complete ? 'rgb(var(--mint))' : 'rgb(var(--accent-ink))'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      {children}
    </span>
  )
}

/* ——— Segmented control ——— */

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  className,
  layoutId,
  label,
}: {
  options: { value: T; label: ReactNode; disabled?: boolean }[]
  value: T
  onChange: (v: T) => void
  className?: string
  layoutId: string
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex rounded-full bg-white/[0.04] p-1', className)}>
      {options.map((o) => {
        const selected = o.value === value
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative h-9 flex-1 rounded-full px-3 text-sm font-medium transition-colors duration-150 disabled:opacity-30',
              selected ? 'text-ink' : 'text-ink-muted hover:text-ink',
            )}
          >
            {selected && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-full border border-line/10 bg-surface-3 shadow-surface"
                transition={{ type: 'spring', bounce: 0.15, duration: 0.3 }}
              />
            )}
            <span className="relative tabular">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/* ——— Switch ——— */

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        'relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200',
        checked ? 'bg-accent' : 'bg-white/[0.1]',
      )}
    >
      <motion.span
        className="absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.4)]"
        initial={false}
        animate={{ x: checked ? 20 : 0 }}
        transition={{ type: 'spring', bounce: 0.2, duration: 0.25 }}
      />
    </button>
  )
}

/* ——— Section heading ——— */

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-h-8 items-center justify-between gap-3', className)}>
      <h2 className="text-sm font-medium text-ink-muted">{children}</h2>
      {action}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-8 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-full bg-white/[0.05] text-ink-muted">
        <Icon className="h-5 w-5" strokeWidth={1.8} />
      </span>
      <p className="mt-3 text-sm font-medium text-ink">{title}</p>
      <p className="mt-1 max-w-[260px] text-sm text-ink-muted">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
