import { useEffect, useRef, useState } from 'react'
import { CalendarDays, User } from 'lucide-react'
import { chipVariants } from '@/components/ui/chip'
import { DatePicker } from '@/components/DatePicker'
import { WeatherPill } from '@/components/WeatherPill'
import type { AuthUser } from '@/state/AuthContext'
import { cn } from '@/lib/utils'

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
  /** Real device time — the date picker's own "today" reference, never fixed. */
  now: Date
  /** The calendar day the board is currently showing (BL-2). */
  viewedDate: Date
  /** Switches the board to a different day. */
  onSelectDate: (date: Date) => void
  /** The signed-in user, or `null` in local-only mode (no backend configured). */
  user: AuthUser | null
  onSignOut: () => void
}

/**
 * The 5 new placeholder pills (Section E) — inert, same treatment as the
 * "Deep log"/"Notes" stub pattern elsewhere: visually present, not wired to
 * anything. Real behaviour for these is a separate, future product decision.
 */
const PLACEHOLDER_PILLS = ['Gifts', 'Chits', 'Opportunities', 'Learnings', 'Feedback']

export function HeaderBar({ now, viewedDate, onSelectDate, user, onSignOut }: HeaderBarProps) {
  return (
    <header className="flex min-h-header flex-wrap items-center justify-between gap-lg mobile:gap-md">
      {/* Section E — the greeting heading, renamed from "30-Minute Slotting"
          to "Consort". This is the greeting text specifically, not the
          sidebar/sign-in brand mark ("Ritual Board"), which is unrelated. */}
      <h1 className="pl-0 font-display text-h1 font-semibold text-ink mobile:pl-[52px] mobile:text-h1-sm">
        Consort
      </h1>
      {/* `flex-wrap` — the whole meta row, placeholder pills included, wraps
          onto a second line if it runs out of horizontal space, rather than
          overflowing. */}
      <div className="flex flex-wrap items-center justify-end gap-sm">
      {/* Truly inert — a `<span>`, not a `<button>`: real button semantics
          would put these in the tab order and announce them as actionable
          to assistive tech, which would be misleading for something with no
          behaviour behind it yet (same reasoning the "Deep log"/Notes stub
          elsewhere in this app already follows). */}
      {PLACEHOLDER_PILLS.map((label) => (
        <span
          key={label}
          className={cn(chipVariants({ tone: 'surface', size: 'sm', interactive: false }), 'font-semibold')}
        >
          {label}
        </span>
      ))}

      {/*
        The date pill is a real navigation control now (BL-2), not display-
        only text, so — unlike the weather pill beside it — it stays visible
        on mobile too: it is the only way a phone-width viewport can view a
        day other than today. Weather remains the phone-only simplification
        the original comment described (secondary context, not something a
        narrow header has room to keep alongside the title and the account
        control).
      */}
      <DatePill now={now} viewedDate={viewedDate} onSelectDate={onSelectDate} />

      <WeatherPill className="mobile:hidden" />

      {user ? (
        <AccountMenu user={user} onSignOut={onSignOut} />
      ) : (
        // No real session (local-only mode) — same non-interactive treatment
        // as before: there is no account menu behind it, so it carries no
        // hover or focus state and is not focusable. No colour any more
        // (Section A) — the theme's own invert pair, same as everywhere
        // else a "primary" mark shows up.
        <div
          className="flex size-avatar cursor-default items-center justify-center rounded-full bg-inv-bg"
          aria-hidden="true"
        >
          <User className="size-[16px] text-inv-ink" />
        </div>
      )}
      </div>
    </header>
  )
}

function DatePill({
  now,
  viewedDate,
  onSelectDate,
}: {
  now: Date
  viewedDate: Date
  onSelectDate: (date: Date) => void
}) {
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

  function selectDate(date: Date) {
    onSelectDate(date)
    setOpen(false)
    triggerRef.current?.focus()
  }

  function close() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Change viewed date — currently ${formatDatePill(viewedDate)}`}
        onClick={() => setOpen((value) => !value)}
        className={cn(chipVariants({ tone: 'surface', size: 'sm', interactive: true }), 'font-semibold')}
      >
        <CalendarDays aria-hidden="true" className="size-[14px] text-ink-dim" />
        <time dateTime={machineDate(viewedDate)}>{formatDatePill(viewedDate)}</time>
      </button>

      {open && <DatePicker viewedDate={viewedDate} today={now} onSelect={selectDate} onClose={close} />}
    </div>
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
          'flex size-avatar items-center justify-center rounded-full bg-inv-bg',
          'transition-[filter] hover:brightness-105 active:brightness-95',
        )}
      >
        <User aria-hidden="true" className="size-[16px] text-inv-ink" />
      </button>

      {open && (
        <div
          ref={panelRef}
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-[calc(100%+8px)] z-30 w-[220px] rounded-md border border-line bg-surface p-xs shadow-elevation-2"
        >
          {user.email && (
            <div className="truncate px-md py-sm text-caption text-ink-dim" title={user.email}>
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
            className="w-full rounded-sm px-md py-sm text-left text-body font-semibold text-ink transition-colors hover:bg-bg"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
