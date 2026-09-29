import { motion } from 'motion/react'
import { CalendarDays, ChartNoAxesColumn, Ellipsis, House, Plus, Sprout, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useStore, type Tab } from '@/lib/store'
import { cn } from '@/lib/utils'

const nav: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'today', label: 'Today', icon: House },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'insights', label: 'Insights', icon: ChartNoAxesColumn },
  { id: 'more', label: 'More', icon: Ellipsis },
]

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-[18px] border border-line/10 bg-[linear-gradient(160deg,rgb(var(--surface-3))_0%,rgb(var(--surface-1))_100%)] shadow-surface',
        className,
      )}
    >
      <Sprout className="h-[46%] w-[46%] text-accent-ink" strokeWidth={1.8} />
    </span>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh md:pl-[84px] xl:pl-[252px]">
      <SideNav />
      <main className="mx-auto w-full max-w-[1200px] px-4 pb-[calc(112px+env(safe-area-inset-bottom))] pt-[max(20px,env(safe-area-inset-top))] sm:px-6 md:px-8 md:pb-12 md:pt-8 xl:px-10">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}

/** Rail on tablet, full sidebar on desktop. */
function SideNav() {
  const { tab, setTab, setQuickLogOpen } = useStore()
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[84px] flex-col border-r border-line/[0.06] bg-canvas/60 px-3 py-6 backdrop-blur md:flex xl:w-[252px] xl:px-4">
      <div className="flex items-center gap-3 px-1 xl:px-2">
        <BrandMark className="h-11 w-11 rounded-[14px]" />
        <span className="hidden font-display text-xl text-ink xl:block">Lumen</span>
      </div>

      <button
        type="button"
        onClick={() => setQuickLogOpen(true)}
        className="mt-8 flex h-11 items-center justify-center gap-2 rounded-full bg-accent text-sm font-medium text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_8px_20px_-8px_rgb(var(--accent)/0.7)] transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.97] xl:justify-start xl:px-4"
        aria-label="Log activity"
      >
        <Plus className="h-[18px] w-[18px]" />
        <span className="hidden xl:inline">Log activity</span>
        <kbd className="ml-auto hidden rounded-md bg-white/15 px-1.5 text-2xs font-medium xl:inline">L</kbd>
      </button>

      <nav className="mt-6 flex flex-col gap-1" aria-label="Primary">
        {nav.map((item) => {
          const active = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex h-14 flex-col items-center justify-center gap-1 rounded-control text-2xs font-medium transition-colors xl:h-11 xl:flex-row xl:justify-start xl:gap-3 xl:px-3 xl:text-sm',
                active ? 'text-ink' : 'text-ink-faint hover:bg-white/[0.03] hover:text-ink-muted',
              )}
            >
              {active && (
                <motion.span
                  layoutId="sidenav-active"
                  className="absolute inset-0 rounded-control bg-white/[0.06]"
                  transition={{ type: 'spring', bounce: 0.15, duration: 0.3 }}
                />
              )}
              <item.icon className={cn('relative h-5 w-5', active && 'text-accent-ink')} strokeWidth={1.8} />
              <span className="relative">{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="mt-auto hidden rounded-card border border-line/[0.07] bg-surface-1/60 p-4 xl:block">
        <p className="text-sm font-medium text-ink">Week 39</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">
          Mornings are your most consistent hours. Protect 7–9 AM.
        </p>
      </div>
    </aside>
  )
}

function BottomNav() {
  const { tab, setTab, setQuickLogOpen } = useStore()
  const left = nav.slice(0, 2)
  const right = nav.slice(2)
  const item = (n: (typeof nav)[number]) => {
    const active = tab === n.id
    return (
      <button
        key={n.id}
        type="button"
        onClick={() => setTab(n.id)}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'relative flex h-14 flex-1 flex-col items-center justify-center gap-1 text-2xs font-medium transition-colors',
          active ? 'text-ink' : 'text-ink-faint active:text-ink-muted',
        )}
      >
        <n.icon className={cn('h-[22px] w-[22px]', active && 'text-accent-ink')} strokeWidth={active ? 2 : 1.7} />
        {n.label}
        {active && (
          <motion.span
            layoutId="bottomnav-active"
            className="absolute bottom-0.5 h-[3px] w-5 rounded-full bg-accent-ink"
            transition={{ type: 'spring', bounce: 0.2, duration: 0.3 }}
          />
        )}
      </button>
    )
  }
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line/[0.07] bg-[rgb(8_12_22/0.88)] backdrop-blur-xl md:hidden"
    >
      <div className="mx-auto flex max-w-[520px] items-center px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-1.5">
        {left.map(item)}
        <div className="flex flex-1 justify-center">
          <button
            type="button"
            onClick={() => setQuickLogOpen(true)}
            aria-label="Log activity"
            className="-mt-7 grid h-[60px] w-[60px] place-items-center rounded-full bg-accent text-white shadow-fab transition-transform duration-150 active:scale-95"
          >
            <Plus className="h-7 w-7" strokeWidth={2} />
          </button>
        </div>
        {right.map(item)}
      </div>
    </nav>
  )
}
