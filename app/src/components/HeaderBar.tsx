import { useEffect, useRef, useState } from 'react'
import { CalendarDays, Sun, User } from 'lucide-react'
import { Chip } from '@/components/ui/chip'
import type { AuthUser } from '@/state/AuthContext'
import { cn } from '@/lib/utils'

/* ---------------------------------------------------------------------------
 * ⚠ PLACEHOLDER DATA — NOT REAL, NOT COMPUTED.
 *
 * There is no weather provider wired up. These values are hardcoded exactly as
 * they were in the prototype and are pending backend integration. Do not treat
 * them as live data, and do not add derived UI (advice, warnings, trends) on
 * top of them until a real source exists.
 * ------------------------------------------------------------------------- */
const PLACEHOLDER_WEATHER = {
  isPlaceholder: true as const,
  temperatureLabel: '28°C',
  location: 'Hyderabad',
}

/**
 * `YYYY-MM-DD` in the DEVICE's timezone, for the <time> element's machine-
 * readable value.
 *
 * `toISOString().slice(0, 10)` was wrong: it is UTC-based, so for every local
 * time before UTC midnight in an ahead-of-UTC zone (the client is in IST,
 * UTC+5:30 — so roughly 00:00–05:29 daily) the attribute named YESTERDAY while
 * the visible label correctly named today.
 */
function machineDate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function formatDatePill(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export interface HeaderBarProps {
  now: Date
  /** The signed-in user, or `null` in local-only mode (no backend configured). */
  user: AuthUser | null
  onSignOut: () => void
}

export function HeaderBar({ now, user, onSignOut }: HeaderBarProps) {
  return (
    <header className="flex min-h-header flex-wrap items-center justify-between gap-lg mobile:gap-md">
      <h1 className="pl-0 font-display text-h1 font-semibold text-forest mobile:pl-[52px] mobile:text-h1-sm">
        30-Minute Slotting
      </h1>
      <div className="flex flex-wrap items-center justify-end gap-sm">
      {/*
        Phone-only simplification, not a data change: the two context pills are
        hidden below 768px so the narrow header keeps the page title, the
        avatar and the menu control legible on one line. iPad and desktop —
        the primary targets — are untouched and still show both.
      */}
      {/* Real device date — the prototype hardcoded "Thu, Aug 20". */}
      <Chip size="sm" className="font-semibold mobile:hidden">
        <CalendarDays aria-hidden="true" className="size-[14px] text-muted" />
        <time dateTime={machineDate(now)}>{formatDatePill(now)}</time>
      </Chip>

      <Chip size="sm" className="font-semibold mobile:hidden">
        <Sun aria-hidden="true" className="size-[14px] text-muted" />
        <span>{PLACEHOLDER_WEATHER.temperatureLabel}</span>
        <span className="text-muted">{PLACEHOLDER_WEATHER.location}</span>
        <span className="sr-only">(placeholder weather, not live data)</span>
      </Chip>

      {user ? (
        <AccountMenu user={user} onSignOut={onSignOut} />
      ) : (
        // No real session (local-only mode) — same non-interactive treatment
        // as before: there is no account menu behind it, so it carries no
        // hover or focus state and is not focusable.
        <div
          className="flex size-avatar cursor-default items-center justify-center rounded-full bg-[linear-gradient(150deg,theme(colors.gold),theme(colors.terracotta))]"
          aria-hidden="true"
        >
          <User className="size-[16px] text-white" />
        </div>
      )}
      </div>
    </header>
  )
}

function AccountMenu({ user, onSignOut }: { user: AuthUser; onSignOut: () => void }) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={user.email ? `Account menu — signed in as ${user.email}` : 'Account menu'}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'flex size-avatar items-center justify-center rounded-full',
          'bg-[linear-gradient(150deg,theme(colors.gold),theme(colors.terracotta))]',
          'transition-[filter] hover:brightness-105 active:brightness-95',
        )}
      >
        <User aria-hidden="true" className="size-[16px] text-white" />
      </button>

      {open && (
        <div
          ref={panelRef}
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-[calc(100%+8px)] z-30 w-[220px] rounded-md border border-line bg-white p-xs shadow-elevation-2"
        >
          {user.email && (
            <div className="truncate px-md py-sm text-caption text-muted" title={user.email}>
              {user.email}
            </div>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onSignOut()
            }}
            className="w-full rounded-sm px-md py-sm text-left text-body font-semibold text-charcoal transition-colors hover:bg-bg"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
