import { CalendarDays, Sun, User } from 'lucide-react'
import { Chip } from '@/components/ui/chip'

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

export function HeaderBar({ now }: { now: Date }) {
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

      {/*
        Not interactive: there is no account menu behind it, so it carries no
        hover or focus state and is not focusable. The dropdown chevron the
        prototype showed has been dropped for the same reason.
      */}
      <div
        className="flex size-avatar cursor-default items-center justify-center rounded-full bg-[linear-gradient(150deg,theme(colors.gold),theme(colors.terracotta))]"
        aria-hidden="true"
      >
        <User className="size-[16px] text-white" />
      </div>
      </div>
    </header>
  )
}
