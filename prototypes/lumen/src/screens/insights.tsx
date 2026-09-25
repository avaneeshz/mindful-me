import { motion } from 'motion/react'
import { Flame, Sun, Timer } from 'lucide-react'
import { useState } from 'react'
import { IconBubble, Segmented } from '@/components/ui/primitives'
import { categories, hueStyles } from '@/lib/data'
import { useStore } from '@/lib/store'
import { addDays, cn, formatClock, formatDuration, fromKey, todayKey } from '@/lib/utils'

export function InsightsScreen() {
  const { days } = useStore()
  const [range, setRange] = useState<7 | 28>(7)
  const [focusCat, setFocusCat] = useState<string | null>(null)
  const today = todayKey()
  const keys = Array.from({ length: range }, (_, i) => addDays(today, -(range - 1 - i)))

  const perDay = keys.map((k) => {
    const entries = days[k]?.entries ?? []
    const byCat = Object.fromEntries(categories.map((c) => [c.id, entries.filter((e) => e.categoryId === c.id).reduce((s, e) => s + e.minutes, 0)]))
    return { k, byCat, total: entries.reduce((s, e) => s + e.minutes, 0) }
  })
  const max = Math.max(...perDay.map((d) => d.total), 60)
  const loggedDays = perDay.filter((d) => d.total > 0)
  const avg = loggedDays.length ? loggedDays.reduce((s, d) => s + d.total, 0) / loggedDays.length : 0
  const totals = categories
    .map((c) => ({ c, m: perDay.reduce((s, d) => s + d.byCat[c.id], 0), days: perDay.filter((d) => d.byCat[c.id] > 0).length }))
    .sort((a, b) => b.m - a.m)
  const consistent = [...totals].sort((a, b) => b.days - a.days)[0]
  const wakes = keys.map((k) => days[k]?.wake).filter((w): w is number => w !== undefined)
  const avgWake = wakes.length ? Math.round(wakes.reduce((a, b) => a + b, 0) / wakes.length / 5) * 5 : 0
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
        <Stat icon={Sun} hue="sun" label="Typical wake-up" value={`${formatClock(avgWake).time} ${formatClock(avgWake).suffix}`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
        <section className="surface rounded-panel p-4 sm:p-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-base font-medium text-ink">Time by day</h2>
            <p className="text-xs text-ink-faint">{focusCat ? 'Tap a category again to clear' : 'Tap a category to isolate it'}</p>
          </div>
          <div className="mt-6 flex h-56 items-end gap-[3px] sm:gap-1.5">
            {perDay.map((d, i) => (
              <div key={d.k} className="flex h-full min-w-0 flex-1 flex-col items-center gap-2">
                <div className="flex w-full flex-1 flex-col-reverse gap-px overflow-hidden rounded-[6px] bg-white/[0.03]">
                  {categories.map((c) => {
                    const m = d.byCat[c.id]
                    if (!m) return null
                    const dim = focusCat && focusCat !== c.id
                    return (
                      <motion.span
                        key={c.id}
                        className={cn('w-full transition-opacity duration-200', hueStyles[c.hue].bar, dim ? 'opacity-[0.08]' : 'opacity-85')}
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
          <h2 className="text-base font-medium text-ink">By category</h2>
          <ul className="mt-4 flex flex-col gap-1">
            {totals.map(({ c, m }) => {
              const selected = focusCat === c.id
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setFocusCat(selected ? null : c.id)}
                    aria-pressed={selected}
                    className={cn(
                      'flex min-h-12 w-full items-center gap-3 rounded-control px-2 text-left transition-colors',
                      selected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]',
                    )}
                  >
                    <IconBubble icon={c.icon} hue={c.hue} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm text-ink">{c.label}</span>
                        <span className="text-xs tabular text-ink-muted">{formatDuration(m)}</span>
                      </div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.05]">
                        <motion.div
                          className={cn('h-full rounded-full', hueStyles[c.hue].bar)}
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
