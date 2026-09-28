import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Download, FileText, LayoutGrid, LogOut, Pencil, Settings, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/lumen/components/ui/button'
import { MenuItem, Popover } from '@/lumen/components/ui/primitives'
import { useLumenAccount } from '@/lumen/lib/account'
import { useStore } from '@/lumen/lib/store'
import { useLumenRange } from '@/lumen/data/useLumenRange'
import { activitiesWithin, axisClock, loggedMinutes, LUMEN_DAY_END, LUMEN_DAY_START, minutesWithin, toAxis } from '@/lumen/domain/lumenDay'
import { addDays, cn, dateKey, formatDay, fromKey, relativeDay } from '@/lumen/lib/utils'
import { useInterfaceMode } from '@/state/InterfaceContext'
import { CustomizeSheet } from './customize-sheet'
import { SyncStatus } from './sync-status'

function greeting(now: Date) {
  const h = now.getHours()
  if (h < 5) return 'Still up'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export function TodayHeader() {
  const { day, today, now } = useStore()
  const { firstName } = useLumenAccount()
  const rel = relativeDay(day, today)
  return (
    <header className="flex items-center gap-4">
      {/* Phone: one row — date, day tools and account */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 md:hidden">
        <h1 className="sr-only">{formatDay(day, 'long')}</h1>
        <DayToolbar compact />
        <ProfileButton />
      </div>
      {/* Tablet & desktop: the day is the headline */}
      <div className="hidden min-w-0 flex-1 md:block">
        <p className="text-sm text-ink-muted">
          {greeting(now)}
          {firstName ? `, ${firstName}` : ''}
          {rel && rel !== 'Today' ? ` · viewing ${rel.toLowerCase()}` : ''}
        </p>
        <h1 className="mt-1 font-display text-4xl text-ink">{formatDay(day, 'long')}</h1>
      </div>
      <div className="hidden items-center gap-2 md:flex">
        <SyncStatus />
        <ProfileButton />
      </div>
    </header>
  )
}

function ProfileButton() {
  const { setTab } = useStore()
  const { setMode } = useInterfaceMode()
  const { signedIn, email, firstName, initials, signOut } = useLumenAccount()
  return (
    <Popover
      align="end"
      className="w-64"
      trigger={
        <Button size="icon" aria-label={email ? `Account — signed in as ${email}` : 'Account'}>
          <UserRound className="h-5 w-5" strokeWidth={1.8} />
        </Button>
      }
    >
      {(close) => (
        <>
          {signedIn && (
            <>
              <div className="flex items-center gap-3 px-3 pb-3 pt-2">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent/20 text-sm font-semibold text-accent-ink">
                  {initials || <UserRound className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />}
                </span>
                <div className="min-w-0">
                  {firstName && <p className="text-sm font-medium text-ink">{firstName}</p>}
                  <p className="truncate text-xs text-ink-muted" title={email ?? undefined}>{email}</p>
                </div>
              </div>
              <div className="my-1 h-px bg-line/[0.07]" />
            </>
          )}
          <MenuItem icon={Settings} onSelect={() => { setTab('more'); close() }}>Settings</MenuItem>
          <MenuItem icon={LayoutGrid} onSelect={() => { close(); setMode('classic') }}>Switch to Classic</MenuItem>
          {signedIn && <MenuItem icon={LogOut} onSelect={() => { close(); void signOut() }}>Sign out</MenuItem>}
        </>
      )}
    </Popover>
  )
}

/* ——— Toolbar: date, export, edit ——— */

/** `compact` is the phone version that shares the top row with the account button. */
export function DayToolbar({ compact = false }: { compact?: boolean }) {
  const [customizeOpen, setCustomizeOpen] = useState(false)
  return (
    <div className={cn('flex items-center', compact ? 'min-w-0 flex-1 gap-1.5' : 'gap-2 sm:gap-3')}>
      <DatePicker compact={compact} />
      <ExportMenu />
      {compact && <SyncStatus compact />}
      {compact ? (
        <Button size="icon" onClick={() => setCustomizeOpen(true)} aria-label="Edit">
          <Pencil className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </Button>
      ) : (
        <Button onClick={() => setCustomizeOpen(true)} className="ml-auto px-4">
          <Pencil className="h-4 w-4" strokeWidth={1.8} />
          Edit
        </Button>
      )}
      <CustomizeSheet open={customizeOpen} onOpenChange={setCustomizeOpen} />
    </div>
  )
}

function DatePicker({ compact }: { compact: boolean }) {
  const { day, setDay, today } = useStore()
  const rel = relativeDay(day, today)
  const isToday = day === today
  return (
    <div className={cn('flex min-w-0 flex-1 items-center', !compact && 'sm:flex-none')}>
      <Popover
        className="w-[min(328px,calc(100vw-32px))] p-4"
        trigger={
          <button
            type="button"
            aria-label={`Change date, ${formatDay(day, 'long')}`}
            className={cn(
              'flex h-11 min-w-0 flex-1 items-center rounded-full border border-line/[0.09] bg-surface-1/70 text-sm font-medium text-ink transition-colors hover:border-line/[0.14] hover:bg-surface-2',
              compact ? 'justify-center gap-2 px-3' : 'gap-2.5 pl-3.5 pr-3 sm:min-w-[196px]',
            )}
          >
            <CalendarDays
              className={cn('h-[18px] w-[18px] shrink-0 text-ink-muted', compact && 'max-[379px]:hidden')}
              strokeWidth={1.8}
            />
            {/* Phone row is tight: "Sun 27" there, "Sun, 27 Sept" elsewhere */}
            <span className="truncate tabular">
              {compact ? fromKey(day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }) : formatDay(day)}
            </span>
            {rel && !compact && <span className="hidden text-ink-faint sm:inline">· {rel}</span>}
            {!compact && <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-ink-muted" />}
          </button>
        }
      >
        {(close) => (
          <MonthGrid
            value={day}
            onSelect={(d) => {
              setDay(d)
              close()
            }}
          />
        )}
      </Popover>
      <div className="ml-1 hidden items-center lg:flex">
        <Button variant="ghost" size="icon" aria-label="Previous day" onClick={() => setDay(addDays(day, -1))}>
          <ChevronLeft className="h-[18px] w-[18px]" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Next day" disabled={isToday} onClick={() => setDay(addDays(day, 1))}>
          <ChevronRight className="h-[18px] w-[18px]" />
        </Button>
      </div>
    </div>
  )
}

export function MonthGrid({ value, onSelect }: { value: string; onSelect: (d: string) => void }) {
  const { today, data } = useStore()
  const [cursor, setCursor] = useState(() => {
    const d = fromKey(value)
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const lead = (cursor.getDay() + 6) % 7 // Monday-first
  const count = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
  const first = dateKey(cursor)
  const range = useLumenRange(first, count)
  // The open day's own live data wins over the range read (it may hold writes the range hasn't seen).
  const byDate = useMemo(() => ({ ...range.byDate, ...data.byDate }), [range.byDate, data.byDate])
  const cells = Array.from({ length: lead + count }, (_, i) =>
    i < lead ? null : dateKey(new Date(cursor.getFullYear(), cursor.getMonth(), i - lead + 1)),
  )
  const shift = (delta: number) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1))
  const atCurrentMonth = cursor.getFullYear() === fromKey(today).getFullYear() && cursor.getMonth() === fromKey(today).getMonth()

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">
          {cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
        </p>
        <div className="-mr-2 flex">
          <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Previous month" onClick={() => shift(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Next month" disabled={atCurrentMonth} onClick={() => shift(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-2xs font-medium text-ink-faint">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i} className="pb-2">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((k, i) => {
          if (!k) return <span key={i} />
          const future = k > today
          const selected = k === value
          const logged = !future && loggedMinutes(toAxis(k, byDate)) > 0
          return (
            <button
              key={k}
              type="button"
              disabled={future}
              onClick={() => onSelect(k)}
              aria-pressed={selected}
              aria-label={`${formatDay(k, 'long')}${logged ? ', has entries' : ''}`}
              className={cn(
                'relative mx-auto grid h-10 w-10 place-items-center rounded-full text-sm tabular transition-colors disabled:text-ink-faint/50',
                selected ? 'bg-accent font-semibold text-white' : 'text-ink hover:bg-white/[0.06]',
                k === today && !selected && 'font-semibold text-accent-ink',
              )}
            >
              {fromKey(k).getDate()}
              {logged && !selected && <span className="absolute bottom-1.5 h-1 w-1 rounded-full bg-ink-faint" />}
            </button>
          )
        })}
      </div>
      {value !== today && (
        <Button variant="ghost" className="mt-3 h-10 w-full text-accent-ink" onClick={() => onSelect(today)}>
          Jump to today
        </Button>
      )}
    </div>
  )
}

const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`

/** The Lumen day's entries as a CSV — every field the entry carries, in time order. */
function ExportMenu() {
  const { axis, day, tileOf, toast } = useStore()
  const exportCsv = () => {
    const items = activitiesWithin(axis, LUMEN_DAY_START, LUMEN_DAY_END)
    const rows = [
      ['lumen_day', 'date', 'start', 'end', 'minutes_in_day', 'tile', 'activity', 'type', 'done', 'quality', 'symptoms', 'protective_response', 'notes'],
      ...items.map(({ activity: a, start, end }) => [
        day,
        addDays(day, Math.floor(start / 1440)),
        axisClock(start),
        axisClock(end),
        String(minutesWithin({ start, end }, LUMEN_DAY_START, LUMEN_DAY_END)),
        tileOf(a)?.label ?? '',
        a.name ?? '',
        a.path.join(' / '),
        a.status === 'completed' ? 'yes' : 'no',
        a.quality.join('; '),
        a.symptoms.join('; '),
        a.flags.join('; '),
        a.notes ?? '',
      ]),
    ]
    const blob = new Blob([rows.map((r) => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `mindful-me-${day}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
    toast({ message: items.length ? `Exported ${items.length} ${items.length === 1 ? 'entry' : 'entries'}` : 'Nothing logged to export' })
  }
  return (
    <Popover
      className="w-64"
      trigger={
        <Button size="icon" aria-label="Export">
          <Download className="h-5 w-5" strokeWidth={1.8} />
        </Button>
      }
    >
      {(close) => (
        <>
          <p className="px-3 pb-1 pt-2 text-xs font-medium text-ink-faint">Export {formatDay(day)}</p>
          <MenuItem icon={FileText} hint=".csv" onSelect={() => { exportCsv(); close() }}>
            Download entries
          </MenuItem>
        </>
      )}
    </Popover>
  )
}
