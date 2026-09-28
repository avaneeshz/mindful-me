import { motion } from 'motion/react'
import { Flame, Sun, Timer } from 'lucide-react'
import { useMemo, useState } from 'react'
import { IconBubble, Segmented } from '@/lumen/components/ui/primitives'
import { useLumenRange } from '@/lumen/data/useLumenRange'
import { axisClock, LUMEN_DAY_START, loggedMinutes, minutesByKey, toAxis } from '@/lumen/domain/lumenDay'
import { FALLBACK_COLOR } from '@/lumen/lib/palette'
import { useStore } from '@/lumen/lib/store'
import { addDays, cn, formatDuration, fromKey } from '@/lumen/lib/utils'

export function InsightsScreen() {
  const { today, data, allTiles, tileOf } = useStore()
  const [range, setRange] = useState<7 | 28>(7)
  const [focusTile, setFocusTile] = useState<string | null>(null)
  const keys = Array.from({ length: range }, (_, i) => addDays(today, -(range - 1 - i)))
  const read = useLumenRange(keys[0], range)
  // Today's live data wins over the range read (it may hold writes the read hasn't seen yet).
  const byDate = useMemo(() => ({ ...read.byDate, ...data.byDate }), [read.byDate, data.byDate])

  // Every Lumen day counts 06:00 → 06:00, the same as Today and Calendar.
  const series = [
    ...allTiles.map((t) => ({ id: t.id, label: t.label, short: t.short, icon: t.icon, color: t.color })),
    { id: 'other', label: 'Other', short: 'Other', icon: Timer, color: FALLBACK_COLOR },
  ]
  const perDay = keys.map((k) => {
    const axis = toAxis(k, byDate)
    const byTile = minutesByKey(axis, (a) => tileOf(a)?.id ?? 'other')
    // When the day got going: the first entry that STARTED inside it —
    // not a sleep carried over from the night before.
    const firstStart = axis.find((item) => item.start >= LUMEN_DAY_START)?.start ?? null
    return { k, byTile, total: loggedMinutes(axis), firstStart }
  })
  const max = Math.max(...perDay.map((d) => d.total), 60)
  const loggedDays = perDay.filter((d) => d.total > 0)
  const avg = loggedDays.length ? loggedDays.reduce((s, d) => s + d.total, 0) / loggedDays.length : 0
  const totals = series
    .map((c) => ({ c, m: perDay.reduce((s, d) => s + (d.byTile.get(c.id) ?? 0), 0), days: perDay.filter((d) => (d.byTile.get(c.id) ?? 0) > 0).length }))
    .filter((x) => x.m > 0)
    .sort((a, b) => b.m - a.m)
  const consistent = [...totals].sort((a, b) => b.days - a.days)[0]
  const starts = perDay.map((d) => d.firstStart).filter((m): m is number => m !== null)
  const avgStart = starts.length ? Math.round(starts.reduce((a, b) => a + b, 0) / starts.length / 5) * 5 : null
  const allMax = totals[0]?.m || 1

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-ink-muted">Insights</p>
          <h1 className="mt-1 font-display text-3xl text-ink md:text-4xl">Your patterns</h1>
        </div>
        <Segmented
          label="Range"
          layoutId="insights-range"
          value={range}
          onChange={setRange}
          className="w-full sm:w-64"
          options={[
            { value: 7, label: 'Week' },
            { value: 28, label: '4 weeks' },
          ]}
        />
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat icon={Timer} hue="accent" label="Avg. logged per day" value={formatDuration(avg)} />
        <Stat
          icon={Flame}
          hue="mint"
          label="Most consistent"
          value={consistent?.c.short ?? '—'}
          hint={consistent ? `${consistent.days} of ${range} days` : undefined}
        />
        <Stat icon={Sun} hue="sun" label="Day usually starts" value={avgStart !== null ? axisClock(avgStart) : '—'} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
        <section className="surface rounded-panel p-4 sm:p-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-base font-medium text-ink">Time by day</h2>
            <p className="text-xs text-ink-faint">
              {read.status === 'offline' ? 'Showing this device only' : focusTile ? 'Tap a tile again to clear' : 'Tap a tile to isolate it'}
            </p>
          </div>
          <div className="mt-6 flex h-56 items-end gap-[3px] sm:gap-1.5">
            {perDay.map((d, i) => (
              <div key={d.k} className="flex h-full min-w-0 flex-1 flex-col items-center gap-2">
                <div className="flex w-full flex-1 flex-col-reverse gap-px overflow-hidden rounded-[6px] bg-white/[0.03]">
                  {series.map((c) => {
                    const m = d.byTile.get(c.id) ?? 0
                    if (!m) return null
                    const dim = focusTile && focusTile !== c.id
                    return (
                      <motion.span
                        key={c.id}
                        className={cn('w-full transition-opacity duration-200', dim ? 'opacity-[0.08]' : 'opacity-90')}
                        style={{ backgroundColor: c.color.shades.base }}
                        initial={{ height: 0 }}
                        animate={{ height: `${(m / max) * 100}%` }}
                        transition={{ duration: 0.35, delay: i * 0.015, ease: [0.22, 1, 0.36, 1] }}
                      />
                    )
                  })}
                </div>
                <span className={cn('text-[10px] tabular', d.k === today ? 'font-semibold text-ink' : 'text-ink-faint')}>
                  {range === 7
                    ? fromKey(d.k).toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2)
                    : i % 7 === 0 || d.k === today
                      ? fromKey(d.k).getDate()
                      : ''}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="surface rounded-panel p-4 sm:p-6">
          <h2 className="text-base font-medium text-ink">By tile</h2>
          <ul className="mt-4 flex flex-col gap-1">
            {totals.length === 0 && <li className="px-2 py-6 text-center text-sm text-ink-muted">Nothing logged in this range yet.</li>}
            {totals.map(({ c, m }) => {
              const selected = focusTile === c.id
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setFocusTile(selected ? null : c.id)}
                    aria-pressed={selected}
                    className={cn(
                      'flex min-h-12 w-full items-center gap-3 rounded-control px-2 text-left transition-colors',
                      selected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]',
                    )}
                  >
                    <IconBubble icon={c.icon} color={c.color.id} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm text-ink">{c.label}</span>
                        <span className="text-xs tabular text-ink-muted">{formatDuration(m)}</span>
                      </div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.05]">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ backgroundColor: c.color.shades.base }}
                          initial={false}
                          animate={{ width: `${(m / allMax) * 100}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </div>
  )
}

function Stat({ icon, hue, label, value, hint }: { icon: typeof Timer; hue: 'accent' | 'mint' | 'sun'; label: string; value: string; hint?: string }) {
  return (
    <div className="surface flex items-center gap-4 rounded-card p-4 sm:flex-col sm:items-start sm:p-5">
      <IconBubble icon={icon} hue={hue} />
      <div>
        <p className="text-sm text-ink-muted">{label}</p>
        <p className="mt-0.5 text-2xl font-medium tabular text-ink">
          {value}
          {hint && <span className="ml-2 text-sm font-normal text-ink-faint">{hint}</span>}
        </p>
      </div>
    </div>
  )
}
