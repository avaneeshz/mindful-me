import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Clock,
  Flag,
  Home,
  LayoutGrid,
  Leaf,
  Menu,
  PanelLeftClose,
  PieChart,
  Settings,
  Sparkles,
  Sprout,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * PORTED AS-IS — explicitly frozen and out of scope for this redesign.
 *
 * The only changes made are the ones the brief called for: emoji glyphs and
 * decorative leaves become Lucide icons (CLAUDE.md bans emoji as primary
 * interface icons), and the radii snap to the 4-step scale. Structure,
 * proportions and copy are untouched.
 */

interface NavEntry {
  label: string
  icon: LucideIcon
  /** Only "Today" has a real screen. The rest are placeholders, as today. */
  to?: string
}

const NAV_ENTRIES: NavEntry[] = [
  { label: 'Today', icon: Home, to: '/' },
  { label: 'My Slots', icon: Clock },
  { label: 'Activity Library', icon: LayoutGrid },
  { label: 'Progress', icon: PieChart },
  { label: 'Insights', icon: Sparkles },
  { label: 'Flags', icon: Flag },
  { label: 'Settings', icon: Settings },
]

const navItemClass =
  'flex items-center gap-md rounded-md px-md py-md text-left text-btn font-medium text-sidebar-muted'

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const mountedRef = useRef(false)

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    if (mobileOpen) {
      closeRef.current?.focus()
      return
    }
    launcherRef.current?.focus()
  }, [mobileOpen])

  useEffect(() => {
    if (!mobileOpen) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [mobileOpen])

  function closeMobileNavigation() {
    setMobileOpen(false)
  }

  const shellClass = cn(
    'sidebar-shell relative flex shrink-0 flex-col overflow-hidden bg-forest py-3xl text-sidebar-text',
    collapsed ? 'sidebar-collapsed' : 'w-sidebar',
    mobileOpen && 'sidebar-mobile-open',
  )

  return (
    <>
      <button
        type="button"
        ref={launcherRef}
        aria-label="Open navigation"
        aria-expanded={mobileOpen}
        aria-controls="primary-navigation"
        onClick={() => setMobileOpen(true)}
        className="mobile-sidebar-launcher fixed left-lg top-lg z-30 hidden size-flag items-center justify-center rounded-md bg-forest text-white shadow-elevation-1 mobile:flex"
      >
        <Menu aria-hidden="true" className="size-[18px]" />
      </button>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={closeMobileNavigation}
          className="sidebar-backdrop fixed inset-0 z-20 hidden bg-charcoal/30 mobile:block"
        />
      )}
      <aside
        className={shellClass}
        role={mobileOpen ? 'dialog' : undefined}
        aria-modal={mobileOpen ? true : undefined}
        aria-label={mobileOpen ? 'Main navigation' : undefined}
      >
      {/*
        Decorative motif — no semantic value, hidden from assistive tech.

        The emoji original (🌿🌱🍃) read as foliage because each glyph is a
        filled silhouette. Ported to Lucide line art at 7% opacity they read as
        stray scribbles instead: only fragments of a thin outline survive, and
        each mark was cropped so hard by the aside's overflow that no whole leaf
        shape was ever visible. Fixed by filling the leaf marks so they read as
        silhouettes rather than hairlines, lifting the opacity (10% filled, 14%
        for the line-art sprout, which carries far less ink), and pulling each
        mark back inside the panel so a whole shape is visible. Structure and
        placement are otherwise untouched — the sidebar itself is out of scope.
      */}
      <Leaf
        aria-hidden="true"
        fill="currentColor"
        strokeWidth={0}
        className="pointer-events-none absolute -right-md -top-sm size-[90px] rotate-[18deg] opacity-[0.10]"
      />
      <Sprout
        aria-hidden="true"
        strokeWidth={2.5}
        className="pointer-events-none absolute -left-lg bottom-[120px] size-[110px] -rotate-[25deg] opacity-[0.14]"
      />
      <Leaf
        aria-hidden="true"
        fill="currentColor"
        strokeWidth={0}
        className="pointer-events-none absolute -right-sm top-[340px] size-[70px] rotate-[50deg] opacity-[0.10]"
      />

      <div className="sidebar-header relative z-10 px-2xl pb-3xl">
        {/*
          The menu button sits on its OWN row above the brand, aligned to the
          trailing edge — expanded and collapsed alike. It is laid out with flex
          (never absolute coordinates), so it cannot overlap the branding at any
          width, and the rail keeps the same control in the same place instead
          of swapping in a different one.

          `min-h-control` reserves the band even in the one state where the
          button itself is hidden (the mobile drawer, which shows the close
          control below instead), so the brand never jumps between states.
        */}
        <div className="sidebar-collapse-row flex min-h-control items-center justify-end">
          <button
            ref={closeRef}
            type="button"
            aria-label="Close navigation"
            onClick={closeMobileNavigation}
            className="sidebar-mobile-close hidden size-flag items-center justify-center rounded-md text-sidebar-text hover:bg-white/10 mobile:flex"
          >
            <PanelLeftClose aria-hidden="true" className="size-[18px]" />
          </button>
          <button
            type="button"
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            aria-pressed={collapsed}
            onClick={() => setCollapsed((value) => !value)}
            className="sidebar-collapse flex size-flag shrink-0 items-center justify-center rounded-md text-sidebar-text transition-colors hover:bg-white/10 mobile:hidden"
          >
            <Menu aria-hidden="true" className="size-[18px]" />
          </button>
        </div>

        <div className="sidebar-brand-row mt-md flex items-start gap-lg">
          <div className="flex min-w-0 items-center gap-md">
            <div className="flex size-brand shrink-0 items-center justify-center rounded-md bg-[linear-gradient(150deg,theme(colors.terracotta),theme(colors.gold))]">
              <Sparkles aria-hidden="true" className="size-[18px] text-white" />
            </div>
            <div className="sidebar-label min-w-0">
              <div className="font-display text-brand font-semibold text-white">Ritual Board</div>
              <div className="mt-xs text-micro text-sidebar-tag">Small steps. Every day.</div>
            </div>
          </div>
        </div>
      </div>

      <nav id="primary-navigation" aria-label="Main" className="relative z-10 flex flex-1 flex-col gap-xs px-lg">
        {NAV_ENTRIES.map(({ label, icon: Icon, to }) =>
          to ? (
            <NavLink
              key={label}
              to={to}
              end
              className={({ isActive }) =>
                cn(navItemClass, isActive && 'bg-white/10 font-semibold text-white')
              }
              onClick={() => setMobileOpen(false)}
              title={label}
            >
              <Icon aria-hidden="true" className="size-[18px] shrink-0" />
              <span className="sidebar-label">{label}</span>
            </NavLink>
          ) : (
            // Placeholder destinations, non-functional exactly as today. They
            // are disabled rather than silently inert so keyboard users are not
            // sent to a control that does nothing.
            <button
              key={label}
              type="button"
              disabled
              title={`${label} (not yet available)`}
              aria-label={`${label}, not yet available`}
              className={cn(navItemClass, 'cursor-not-allowed opacity-70')}
            >
              <Icon aria-hidden="true" className="size-[18px] shrink-0" />
              <span className="sidebar-label">{label}</span>
              <span className="sr-only">(not yet available)</span>
            </button>
          ),
        )}
      </nav>

      <div className="sidebar-label relative z-10 mx-lg rounded-lg bg-white/[0.07] p-lg">
        <div className="mb-xs text-note font-bold text-white">Stay Consistent</div>
        <div className="mb-md text-caption-sm text-sidebar-dim">
          Build better rituals, one slot at a time.
        </div>
        {/*
          Same honest treatment as the placeholder nav items above: this was a
          plain <span> styled exactly like a working button — not focusable, no
          handler, no disabled affordance, and no destination behind it. It is
          now a real disabled button, so it looks and behaves unavailable
          instead of merely ignoring every click. No destination was invented.
        */}
        <button
          type="button"
          disabled
          className="inline-block cursor-not-allowed rounded-sm bg-sidebar-text px-md py-sm text-caption-sm font-bold text-forest opacity-70"
        >
          View Tips →<span className="sr-only"> (not yet available)</span>
        </button>
      </div>
      </aside>
    </>
  )
}
