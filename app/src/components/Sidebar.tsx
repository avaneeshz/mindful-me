import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Clock,
  Flag,
  Home,
  LayoutGrid,
  Leaf,
  Lightbulb,
  Menu,
  PanelLeftClose,
  PieChart,
  Settings,
  Sparkles,
  Sprout,
  StickyNote,
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

const NAV_TODAY: NavEntry[] = [{ label: 'Today', icon: Home, to: '/' }]

/**
 * Its own group directly below "Today". Non-functional for now (no
 * destination) — these were moved out of the header's note-pill row and just
 * need a home in the nav; wiring comes later.
 */
const NAV_NOTES: NavEntry[] = [
  { label: 'Opportunities', icon: Lightbulb },
  { label: 'Chits', icon: StickyNote },
]

const NAV_REST: NavEntry[] = [
  { label: 'My Slots', icon: Clock },
  { label: 'Activity Library', icon: LayoutGrid },
  { label: 'Progress', icon: PieChart },
  { label: 'Insights', icon: Sparkles },
  { label: 'Flags', icon: Flag },
  { label: 'Settings', icon: Settings },
]

const navItemClass =
  'flex items-center gap-md rounded-md px-md py-md text-left text-btn font-medium text-ink-dim transition-all duration-200 hover:text-ink hover:bg-surface-2/40'

/**
 * One nav row. A `to` entry is a real link; everything else is a disabled
 * button — non-functional but honest about it, so keyboard users are not sent
 * to a control that does nothing.
 */
function renderNavEntry({ label, icon: Icon, to }: NavEntry, onNavigate: () => void) {
  if (to) {
    return (
      <NavLink
        key={label}
        to={to}
        end
        className={({ isActive }) =>
          cn(
            navItemClass,
            isActive && 'bg-accent-primary-dim border-l-2 border-accent-primary font-semibold text-ink pl-[calc(1rem-2px)]',
          )
        }
        onClick={onNavigate}
        title={label}
      >
        <Icon aria-hidden="true" className="size-[18px] shrink-0" />
        <span className="sidebar-label">{label}</span>
      </NavLink>
    )
  }
  return (
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
  )
}

export function Sidebar() {
  // Collapsed by default on every viewport (desktop, tablet, mobile) — the
  // hamburger toggle still expands/collapses it identically, only the
  // initial state changed. The mobile drawer's own open/closed state
  // (`mobileOpen`) is separate and already starts closed.
  const [collapsed, setCollapsed] = useState(true)
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
    // Section A — the sidebar now follows the light/dark theme (the
    // reference implementation's own `background: var(--bg)`), rather than
    // staying a fixed dark rail regardless of theme. A right border is what
    // now separates it from the main content, since the two share the same
    // background colour — there was no need for one when the sidebar was
    // always a distinct dark green against a warm-ivory page.
    'sidebar-shell relative flex shrink-0 flex-col overflow-hidden border-r border-line-soft bg-bg py-3xl text-ink',
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
        className="mobile-sidebar-launcher fixed left-lg top-lg z-30 hidden size-flag items-center justify-center rounded-lg bg-surface-2 text-ink shadow-elevation-1 border border-line-soft hover:border-line hover:shadow-elevation-2 transition-all duration-200 mobile:flex"
      >
        <Menu aria-hidden="true" className="size-[18px]" strokeWidth={2.5} />
      </button>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={closeMobileNavigation}
          className="sidebar-backdrop fixed inset-0 z-20 hidden bg-black/30 mobile:block"
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
            className="sidebar-mobile-close hidden size-flag items-center justify-center rounded-md text-ink hover:bg-surface-2/60 transition-all duration-200 mobile:flex"
          >
            <PanelLeftClose aria-hidden="true" className="size-[18px]" strokeWidth={2.5} />
          </button>
          <button
            type="button"
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            aria-pressed={collapsed}
            onClick={() => setCollapsed((value) => !value)}
            className="sidebar-collapse flex size-flag shrink-0 items-center justify-center rounded-md text-ink transition-all duration-200 hover:bg-surface-2/60 hover:border hover:border-line-soft mobile:hidden"
          >
            <Menu aria-hidden="true" className="size-[18px]" strokeWidth={2.5} />
          </button>
        </div>

        <div className="sidebar-brand-row mt-md flex items-start gap-lg">
          <div className="flex min-w-0 items-center gap-md">
            <div className="flex size-brand shrink-0 items-center justify-center rounded-lg bg-accent-primary-dim border border-accent-primary/30 transition-all duration-200 hover:border-accent-primary hover:shadow-glow-accent">
              <Sparkles aria-hidden="true" className="size-[18px] text-accent-primary" strokeWidth={2.5} />
            </div>
            <div className="sidebar-label min-w-0">
              <div className="font-display text-brand font-semibold text-ink">Ritual Board</div>
              <div className="mt-xs text-micro text-ink-dim">Small steps. Every day.</div>
            </div>
          </div>
        </div>
      </div>

      <nav id="primary-navigation" aria-label="Main" className="relative z-10 flex flex-1 flex-col gap-xs px-lg">
        {NAV_TODAY.map((entry) => renderNavEntry(entry, () => setMobileOpen(false)))}

        {/* Opportunities / Chits — their own group right below Today. */}
        {NAV_NOTES.map((entry) => renderNavEntry(entry, () => setMobileOpen(false)))}

        <div className="my-sm border-t border-line-soft" aria-hidden="true" />

        {NAV_REST.map((entry) => renderNavEntry(entry, () => setMobileOpen(false)))}
      </nav>

      <div className="sidebar-label relative z-10 mx-lg rounded-lg bg-accent-primary-dim border border-accent-primary/30 p-lg transition-all duration-200 hover:border-accent-primary">
        <div className="mb-xs text-note font-bold text-ink">Stay Consistent</div>
        <div className="mb-md text-caption-sm text-ink-dim">
          Build better rituals, one slot at a time.
        </div>
        <button
          type="button"
          disabled
          className="inline-block cursor-not-allowed rounded-md bg-surface-2 px-md py-sm text-caption-sm font-bold text-ink-dim opacity-50 transition-all duration-200 border border-line-softer"
        >
          View Tips →<span className="sr-only"> (not yet available)</span>
        </button>
      </div>
      </aside>
    </>
  )
}
