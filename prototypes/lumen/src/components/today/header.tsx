import { Bell, ChevronLeft, ChevronRight, ChevronDown, CalendarDays, Download, FileText, HeartPulse, Loader2, Pencil, Share2, Settings, LogOut, UserRound } from 'lucide-react'
import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { BrandMark } from '@/components/shell'
import { Button } from '@/components/ui/button'
import { MenuItem, Popover } from '@/components/ui/primitives'
import { categoryById, activityLabel } from '@/lib/data'
import { useStore } from '@/lib/store'
import { addDays, cn, dateKey, formatDay, fromKey, relativeDay, slotStart, todayKey } from '@/lib/utils'
import { CustomizeSheet } from './customize-sheet'

function greeting() {
  const h = new Date().getHours()
  if (h < 5) return 'Still up'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export function TodayHeader() {
  const { date } = useStore()
  const rel = relativeDay(date)
  return (
    <header className="flex items-center gap-4">
      {/* Phone: brand lockup, as the app's front door */}
      <div className="flex min-w-0 flex-1 items-center gap-4 md:hidden">
        <BrandMark className="h-14 w-14" />
        <div className="min-w-0">
          <h1 className="font-display text-[30px] leading-[34px] tracking-[-0.02em] text-ink">Lumen</h1>
          <p className="truncate text-sm text-ink-muted">Live gently. Notice more.</p>
        </div>
      </div>
      {/* Tablet & desktop: the day is the headline */}
      <div className="hidden min-w-0 flex-1 md:block">
        <p className="text-sm text-ink-muted">
          {greeting()}, Maya{rel && rel !== 'Today' ? ` · viewing ${rel.toLowerCase()}` : ''}
        </p>
        <h1 className="mt-1 font-display text-4xl text-ink">{formatDay(date, 'long')}</h1>
      </div>
      <div className="flex items-center gap-2">
        <NotificationsButton />
        <ProfileButton />
      </div>
    </header>
  )
}

function NotificationsButton() {
  const { notices, markNoticesRead } = useStore()
  const unread = notices.filter((n) => n.unread).length
  return (
    <Popover
      align="end"
      className="w-[min(340px,calc(100vw-32px))] p-0"
      onOpenChange={(o) => !o && markNoticesRead()}
      trigger={
        <Button size="icon" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} className="relative">
          <Bell className="h-5 w-5" strokeWidth={1.8} />
          {unread > 0 && <span className="absolute right-[11px] top-[10px] h-2 w-2 rounded-full bg-mint ring-2 ring-surface-1" />}
        </Button>
      }
    >
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <p className="text-sm font-semibold text-ink">Notifications</p>
        {unread > 0 && <span className="text-xs text-ink-muted">{unread} new</span>}
      </div>
      <ul className="p-2 pt-0">
        {notices.map((n) => (
          <li key={n.id} className="flex gap-3 rounded-control px-2 py-3 hover:bg-white/[0.03]">
            <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.unread ? 'bg-mint' : 'bg-white/10')} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{n.title}</p>
              <p className="mt-0.5 text-sm leading-snug text-ink-muted">{n.body}</p>
              <p className="mt-1 text-xs text-ink-faint">{n.time}</p>
            </div>
          </li>
        ))}
      </ul>
    </Popover>
  )
}

function ProfileButton() {
  const { setTab } = useStore()
  return (
    <Popover
      align="end"
      className="w-60"
      trigger={
        <Button size="icon" aria-label="Account">
          <UserRound className="h-5 w-5" strokeWidth={1.8} />
        </Button>
      }
    >
      {(close) => (
        <>
          <div className="flex items-center gap-3 px-3 pb-3 pt-2">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-accent/20 text-sm font-semibold text-accent-ink">MR</span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">Maya Rivera</p>
              <p className="truncate text-xs text-ink-muted">Lumen Plus · since 2024</p>
            </div>
          </div>
          <div className="my-1 h-px bg-line/[0.07]" />
          <MenuItem icon={Settings} onSelect={() => { setTab('more'); close() }}>Settings</MenuItem>
          <MenuItem icon={LogOut} onSelect={close}>Sign out</MenuItem>
        </>
      )}
    </Popover>
  )
}

/* ——— Toolbar: date, export, health sync, customize ——— */

export function DayToolbar() {
  const { healthSync, toggleHealthSync } = useStore()
  const [customizeOpen, setCustomizeOpen] = useState(false)
  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <DatePicker />
      <ExportMenu />
      <Button
        size="icon"
        variant={healthSync === 'off' ? 'quiet' : 'active'}
        onClick={toggleHealthSync}
        aria-pressed={healthSync !== 'off'}
        aria-label={healthSync === 'off' ? 'Connect Health' : 'Health sync on'}
        title={healthSync === 'off' ? 'Sync with Health' : 'Health sync on'}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={healthSync === 'syncing' ? 'spin' : 'heart'}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
            className="grid place-items-center"
          >
            {healthSync === 'syncing' ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <HeartPulse className="h-5 w-5" strokeWidth={1.8} />
            )}
          </motion.span>
        </AnimatePresence>
      </Button>
      <Button onClick={() => setCustomizeOpen(true)} className="ml-auto px-3.5 max-[379px]:w-11 max-[379px]:px-0 sm:px-4">
        <Pencil className="h-4 w-4" strokeWidth={1.8} />
        <span className="max-[379px]:sr-only">Edit</span>
      </Button>
      <CustomizeSheet open={customizeOpen} onOpenChange={setCustomizeOpen} />
    </div>
  )
}

function DatePicker() {
  const { date, setDate } = useStore()
  const rel = relativeDay(date)
  const isToday = date === todayKey()
  return (
    <div className="flex min-w-0 flex-1 items-center sm:flex-none">
      <Popover
        className="w-[min(328px,calc(100vw-32px))] p-4"
        trigger={
          <button
            type="button"
            className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-line/[0.09] bg-surface-1/70 pl-3.5 pr-3 text-sm font-medium text-ink transition-colors hover:border-line/[0.14] hover:bg-surface-2 sm:min-w-[196px]"
          >
            <CalendarDays className="h-[18px] w-[18px] shrink-0 text-ink-muted" strokeWidth={1.8} />
            <span className="truncate">{formatDay(date)}</span>
            {rel && <span className="hidden text-ink-faint sm:inline">· {rel}</span>}
            <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-ink-muted" />
          </button>
        }
      >
        {(close) => (
          <MonthGrid
            value={date}
            onSelect={(d) => {
              setDate(d)
              close()
            }}
          />
        )}
      </Popover>
      <div className="ml-1 hidden items-center lg:flex">
        <Button variant="ghost" size="icon" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}>
          <ChevronLeft className="h-[18px] w-[18px]" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Next day" disabled={isToday} onClick={() => setDate(addDays(date, 1))}>
          <ChevronRight className="h-[18px] w-[18px]" />
        </Button>
      </div>
    </div>
  )
}

export function MonthGrid({ value, onSelect }: { value: string; onSelect: (d: string) => void }) {
  const { days } = useStore()
  const [cursor, setCursor] = useState(() => {
    const d = fromKey(value)
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const today = todayKey()
  const lead = (cursor.getDay() + 6) % 7 // Monday-first
  const count = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
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
          const logged = (days[k]?.entries.length ?? 0) > 0
          return (
            <button
              key={k}
              type="button"
              disabled={future}
              onClick={() => onSelect(k)}
              aria-pressed={selected}
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

function ExportMenu() {
  const { day, date, toast } = useStore()
  const exportCsv = () => {
    const rows = [
      ['date', 'start', 'category', 'activity', 'minutes'],
      ...[...day.entries]
        .sort((a, b) => a.slot - b.slot)
        .map((e) => [date, slotStart(e.slot), categoryById[e.categoryId].label, activityLabel(e.categoryId, e.activityId), String(e.minutes)]),
    ]
    const blob = new Blob([rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `lumen-${date}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    toast({ message: `Exported ${day.entries.length} entries` })
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
          <p className="px-3 pb-1 pt-2 text-xs font-medium text-ink-faint">Export {formatDay(date)}</p>
          <MenuItem icon={FileText} hint=".csv" onSelect={() => { exportCsv(); close() }}>
            Download entries
          </MenuItem>
          <MenuItem
            icon={Share2}
            onSelect={() => {
              close()
              toast({ message: 'Summary link copied' })
            }}
          >
            Share day summary
          </MenuItem>
        </>
      )}
    </Popover>
  )
}
