import { motion } from 'motion/react'
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { IconBubble } from '@/components/ui/primitives'
import { categories, windowEntries } from '@/lib/data'
import { useStore } from '@/lib/store'
import { cn, dateKey, formatDay, formatDuration, fromKey, todayKey } from '@/lib/utils'

export function CalendarScreen() {
  const { days, setDate, setTab } = useStore()
  const today = todayKey()
  const [cursor, setCursor] = useState(() => {
    const d = fromKey(today)
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [picked, setPicked] = useState(today)
  const lead = (cursor.getDay() + 6) % 7
  const count = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
  const cells = Array.from({ length: Math.ceil((lead + count) / 7) * 7 }, (_, i) => {
    const n = i - lead + 1
    return n < 1 || n > count ? null : dateKey(new Date(cursor.getFullYear(), cursor.getMonth(), n))
  })
  const logged = (k: string) => windowEntries(days, k).reduce((s, e) => s + e.minutes, 0)
  const maxLogged = 16 * 60
  const pickedEntries = windowEntries(days, picked)
  const pickedTotals = categories
    .map((c) => ({ c, m: pickedEntries.filter((e) => e.categoryId === c.id).reduce((s, e) => s + e.minutes, 0) }))
    .filter((x) => x.m > 0)
    .sort((a, b) => b.m - a.m)
  const isCurrentMonth = cursor.getMonth() === fromKey(today).getMonth() && cursor.getFullYear() === fromKey(today).getFullYear()

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm text-ink-muted">Calendar</p>
        <h1 className="mt-1 font-display text-3xl text-ink md:text-4xl">
          {cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
        </h1>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
        <section className="surface rounded-panel p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-ink-muted">Darker days hold more logged time</p>
            <div className="-mr-2 flex">
              <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
                <ChevronLeft className="h-[18px] w-[18px]" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Next month" disabled={isCurrentMonth} onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
                <ChevronRight className="h-[18px] w-[18px]" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1.5 text-center text-2xs font-medium uppercase tracking-[0.06em] text-ink-faint sm:gap-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <span key={d} className="pb-1">{d.slice(0, 1)}<span className="hidden sm:inline">{d.slice(1)}</span></span>
            ))}
            {cells.map((k, i) => {
              if (!k) return <span key={i} className="aspect-square" />
              const m = logged(k)
              const future = k > today
              const intensity = Math.min(1, m / maxLogged)
              const selected = k === picked
              return (
                <button
                  key={k}
                  type="button"
                  disabled={future}
                  onClick={() => setPicked(k)}
                  aria-pressed={selected}
                  className={cn(
                    'relative flex aspect-square flex-col items-start justify-between rounded-[12px] border p-1.5 text-left transition-[border-color,transform] duration-150 active:scale-[0.96] disabled:opacity-35 sm:rounded-control sm:p-2.5',
                    selected ? 'border-accent-ink/70' : 'border-transparent hover:border-line/15',
                  )}
                  style={{ backgroundColor: future ? 'rgb(255 255 255 / 0.02)' : `rgb(var(--accent) / ${0.05 + intensity * 0.4})` }}
                >
                  <span className={cn('text-xs font-medium tabular sm:text-sm', k === today ? 'text-accent-ink' : 'text-ink')}>
                    {fromKey(k).getDate()}
                  </span>
                  {m > 0 && <span className="hidden text-2xs tabular text-ink-muted sm:block">{formatDuration(m)}</span>}
                </button>
              )
            })}
          </div>
        </section>

        <motion.section
          key={picked}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="surface rounded-panel p-4 sm:p-6"
        >
          <p className="text-sm text-ink-muted">{picked === today ? 'Today' : 'Selected day'}</p>
          <p className="mt-1 text-xl font-medium text-ink">{formatDay(picked, 'long')}</p>
          <p className="mt-4 text-3xl font-medium tabular text-ink">
            {formatDuration(logged(picked))}
            <span className="ml-2 text-sm font-normal text-ink-muted">logged</span>
          </p>
          <ul className="mt-5 flex flex-col gap-3">
            {pickedTotals.length === 0 && <li className="text-sm text-ink-muted">No entries for this day.</li>}
            {pickedTotals.map(({ c, m }) => (
              <li key={c.id} className="flex items-center gap-3">
                <IconBubble icon={c.icon} hue={c.hue} size="sm" />
                <span className="flex-1 text-sm text-ink">{c.label}</span>
                <span className="text-sm tabular text-ink-muted">{formatDuration(m)}</span>
              </li>
            ))}
          </ul>
          <Button
            className="mt-6 w-full"
            onClick={() => {
              setDate(picked)
              setTab('today')
            }}
          >
            Open day <ArrowRight className="h-4 w-4" />
          </Button>
        </motion.section>
      </div>
    </div>
  )
}
