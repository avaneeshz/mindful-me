import { motion } from 'motion/react'
import { Moon, Sun } from 'lucide-react'
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { categoryById, hueStyles, type Entry } from '@/lib/data'
import { useStore } from '@/lib/store'
import {
  DAY_FIRST_SLOT,
  NIGHT_FIRST_SLOT,
  SLOT_MINUTES,
  addDays,
  cn,
  formatDay,
  formatDuration,
  slotRange,
} from '@/lib/utils'

type Half = 'day' | 'night'

const HALVES: Record<Half, { first: number; label: string; range: string; ticks: string[] }> = {
  day: { first: DAY_FIRST_SLOT, label: 'Day', range: '6 AM – 6 PM', ticks: ['6 AM', '9', '12 PM', '3', '6 PM'] },
  night: { first: NIGHT_FIRST_SLOT, label: 'Night', range: '6 PM – 6 AM', ticks: ['6 PM', '9', '12 AM', '3', '6 AM'] },
}
const SLOTS = 24 // half-hours per strip
const SPAN = SLOTS * SLOT_MINUTES // 720 minutes
const pct = (min: number) => `${(min / SPAN) * 100}%`

/** Day (6 AM – 6 PM) and Night (6 PM – 6 AM) as two continuous strips. */
export function DayStrips() {
  return (
    <div className="grid grid-cols-1 gap-3">
      <Strip half="day" />
      <Strip half="night" />
    </div>
  )
}

/** Continuous coloured spans in strip-minutes; back-to-back pieces of one category join up. */
function toSpans(entries: Entry[], first: number) {
  const out: { categoryId: string; start: number; end: number }[] = []
  for (let i = 0; i < SLOTS; i++) {
    let t = i * SLOT_MINUTES
    for (const e of entries.filter((x) => x.slot === first + i)) {
      const last = out[out.length - 1]
      if (last && last.categoryId === e.categoryId && last.end === t) last.end = t + e.minutes
      else out.push({ categoryId: e.categoryId, start: t, end: t + e.minutes })
      t += e.minutes
    }
  }
  return out
}

function Strip({ half }: { half: Half }) {
  const { entries, selectedSlot, setSelectedSlot, nowSlot, isToday, date } = useStore()
  const cfg = HALVES[half]
  const night = half === 'night'
  const ref = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  const own = useMemo(() => entries.filter((e) => e.slot >= cfg.first && e.slot < cfg.first + SLOTS), [entries, cfg.first])
  const spans = useMemo(() => toSpans(own, cfg.first), [own, cfg.first])
  const total = own.reduce((s, e) => s + e.minutes, 0)

  const index = selectedSlot - cfg.first
  const selectedHere = index >= 0 && index < SLOTS
  // "Now" to the minute, so the line moves smoothly rather than jumping per slot.
  const nowMinutes = (() => {
    if (!isToday) return null
    const d = new Date()
    const offset = (nowSlot - cfg.first) * SLOT_MINUTES + (d.getMinutes() % SLOT_MINUTES)
    return offset >= 0 && offset < SPAN ? offset : null
  })()
  const allPast = !isToday || nowSlot >= cfg.first + SLOTS
  const futureFrom = allPast ? null : Math.max(0, nowMinutes ?? 0)
  const nextDay = formatDay(addDays(date, 1)).split(' ').slice(0, 2).join(' ').replace(',', '')

  const pickAt = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    const i = Math.max(0, Math.min(SLOTS - 1, Math.floor(((clientX - r.left) / r.width) * SLOTS)))
    if (cfg.first + i !== selectedSlot) setSelectedSlot(cfg.first + i)
  }
  const onPointerDown = (e: PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
    pickAt(e.clientX)
  }
  const onKey = (e: KeyboardEvent) => {
    const delta = { ArrowLeft: -1, ArrowRight: 1, Home: -SLOTS, End: SLOTS }[e.key]
    if (delta === undefined) return
    e.preventDefault()
    const from = selectedHere ? index : delta > 0 ? -1 : SLOTS
    setSelectedSlot(cfg.first + Math.max(0, Math.min(SLOTS - 1, from + delta)))
  }

  return (
    <section className="surface rounded-card px-4 pb-3.5 pt-4 sm:px-5" aria-label={`${cfg.label}, ${cfg.range}`}>
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'grid h-10 w-10 shrink-0 place-items-center rounded-full',
            night
              ? 'bg-[radial-gradient(circle_at_35%_30%,#8E90FF_0%,#5B5CE0_55%,#3D3AB5_100%)] text-white shadow-[0_0_22px_-6px_rgb(99_102_241/0.6)]'
              : 'bg-[radial-gradient(circle_at_35%_30%,#FFD68A_0%,#F9A43B_55%,#E77F2A_100%)] text-[#5A2A06] shadow-[0_0_22px_-6px_rgb(249_164_59/0.6)]',
          )}
          aria-hidden
        >
          {night ? <Moon className="h-5 w-5" strokeWidth={2} /> : <Sun className="h-5 w-5" strokeWidth={2} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium text-ink">{cfg.label}</p>
          <p className="truncate text-xs tabular text-ink-muted">
            {cfg.range}
            {night && ` · into ${nextDay}`}
          </p>
        </div>
        <p className="whitespace-nowrap text-sm text-ink-muted">
          <span className="font-medium tabular text-ink">{total > 0 ? formatDuration(total) : '—'}</span> logged
        </p>
      </div>

      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label={`${cfg.label} half-hours`}
        aria-valuemin={cfg.first}
        aria-valuemax={cfg.first + SLOTS - 1}
        aria-valuenow={selectedHere ? selectedSlot : undefined}
        aria-valuetext={selectedHere ? slotRange(selectedSlot) : 'No half-hour selected'}
        onPointerDown={onPointerDown}
        onPointerMove={(e) => dragging && pickAt(e.clientX)}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onKeyDown={onKey}
        className={cn(
          'relative h-10 cursor-pointer touch-pan-y rounded-control outline-none focus-visible:ring-2 focus-visible:ring-accent-ink',
          night ? 'mt-8' : 'mt-4',
        )}
      >
        {/* Sky, logged time and the not-yet-happened veil, clipped to the strip's rounded shape.
            Logged blocks fill the full height so no sky shows above or below them. */}
        <span className="absolute inset-0 overflow-hidden rounded-control">
          <span className="absolute inset-0" style={{ background: night ? 'var(--sky-night)' : 'var(--sky-day)' }} />
          <span className="absolute inset-0 bg-canvas/55" />
          {spans.map((s) => (
            <motion.span
              key={`${s.categoryId}-${s.start}`}
              className={cn('absolute inset-y-0', hueStyles[categoryById[s.categoryId].hue].bar)}
              style={{ left: pct(s.start) }}
              initial={{ width: 0 }}
              animate={{ width: pct(s.end - s.start) }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            />
          ))}
          {futureFrom !== null && (
            <span className="absolute inset-y-0 right-0 bg-canvas/40" style={{ left: pct(futureFrom) }} aria-hidden />
          )}
        </span>

        {night && (
          <>
            <span className="absolute -bottom-2 -top-2 left-1/2 border-l border-dashed border-ink/50" aria-hidden />
            <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-line/10 bg-surface-3 px-2 py-px text-2xs font-semibold uppercase tracking-[0.06em] text-ink">
              {nextDay} · next day
            </span>
          </>
        )}

        {selectedHere && (
          <motion.span
            className="pointer-events-none absolute -bottom-1 -top-1 rounded-[7px] bg-white/10 shadow-[0_0_0_2px_rgb(var(--accent-ink)),0_0_16px_rgb(var(--accent-ink)/0.35)]"
            style={{ width: pct(SLOT_MINUTES) }}
            initial={false}
            animate={{ left: pct(index * SLOT_MINUTES) }}
            transition={dragging ? { duration: 0 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          />
        )}

        {nowMinutes !== null && (
          <span className="pointer-events-none absolute -bottom-2 -top-2 w-0.5 -translate-x-1/2 rounded-full bg-mint" style={{ left: pct(nowMinutes) }}>
            <span className="absolute -left-[3px] -top-1 h-2 w-2 rounded-full bg-mint" />
          </span>
        )}
      </div>

      <div className="relative mt-2.5 h-4 text-2xs tabular text-ink-faint">
        {cfg.ticks.map((t, i) => (
          <span
            key={t}
            className={cn(
              'absolute top-0 whitespace-nowrap',
              i === 0 ? 'left-0' : i === cfg.ticks.length - 1 ? 'right-0' : '-translate-x-1/2',
              night && i === 2 && 'text-accent-ink',
            )}
            style={i === 0 || i === cfg.ticks.length - 1 ? undefined : { left: `${i * 25}%` }}
          >
            {t}
          </span>
        ))}
      </div>
    </section>
  )
}
