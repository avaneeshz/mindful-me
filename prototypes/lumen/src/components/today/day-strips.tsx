import { motion } from 'motion/react'
import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
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

/**
 * Natural light across each half, as [position 0–1, colour, intensity 0–1].
 * Day peaks at noon (0.5); night is darkest at midnight (0.5) and lifts again towards 6 AM.
 * The capsule and the essence line both read from this one model.
 */
type Stop = [number, string, number]
/** Mirror a 0 → 0.5 curve around its midpoint, so 9 AM matches 3 PM, 9 PM matches 3 AM, and so on. */
const mirror = (half: Stop[]): Stop[] => [
  ...half,
  ...half
    .filter(([at]) => at < 0.5)
    .reverse()
    .map(([at, c, i]): Stop => [Number((1 - at).toFixed(3)), c, i]),
]
const LIGHT: Record<Half, Stop[]> = {
  // Dawn amber → golden morning → brightest at noon
  day: mirror([
    [0, '#c9744f', 0.35],
    [0.1, '#dc9a5a', 0.5],
    [0.25, '#efc576', 0.74],
    [0.4, '#f7e0a6', 0.92],
    [0.5, '#fff4d8', 1],
  ]),
  // Evening indigo → deepening → darkest at midnight
  night: mirror([
    [0, '#8b84e4', 0.8],
    [0.12, '#6865cb', 0.66],
    [0.25, '#42419c', 0.46],
    [0.4, '#1f2062', 0.26],
    [0.5, '#0c0d2c', 0.12],
  ]),
}
const lightGradient = (half: Half) =>
  `linear-gradient(90deg, ${LIGHT[half].map(([at, c]) => `${c} ${at * 100}%`).join(', ')})`

const STRIP_H = 40 // px — the capsule's height; its radius is half of this
const LINE_W = 2.5 // px — the essence line's stroke

/** Day (6 AM – 6 PM) and Night (6 PM – 6 AM) as two continuous strips. */
export function DayStrips() {
  return (
    <div className="grid grid-cols-1 gap-5 px-1 py-1">
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
    <section aria-label={`${cfg.label}, ${cfg.range}${night ? `, into ${nextDay}` : ''}, ${total > 0 ? formatDuration(total) : 'nothing'} logged`}>
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
          'relative h-10 cursor-pointer touch-pan-y rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent-ink focus-visible:ring-offset-4 focus-visible:ring-offset-canvas',
        )}
      >
        {/* Glass capsule: navy base, the light gradient, logged time, then the not-yet-happened veil.
            Everything is clipped to the pill so logged blocks fill it edge to edge. */}
        <span
          className={cn(
            'absolute inset-0 overflow-hidden rounded-full bg-surface-1',
            night
              ? 'shadow-[0_8px_24px_-14px_rgb(99_102_241/0.55)]'
              : 'shadow-[0_8px_24px_-14px_rgb(251_214_140/0.45)]',
          )}
        >
          <span className="absolute inset-0" style={{ background: lightGradient(half), opacity: night ? 0.92 : 0.82 }} />
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
            <span className="absolute inset-y-0 right-0 bg-canvas/30" style={{ left: pct(futureFrom) }} aria-hidden />
          )}
          {/* Glass: a soft highlight along the top edge only, so the lower edge meets the essence line cleanly */}
          <span
            className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_1px_0_rgb(255_255_255/0.18),inset_0_8px_14px_-12px_rgb(255_255_255/0.12)]"
            aria-hidden
          />
        </span>

        <EssenceLine half={half} />

        {night && <span className="pointer-events-none absolute inset-y-1.5 left-1/2 border-l border-dashed border-ink/25" aria-hidden />}

        {selectedHere && (
          <motion.span
            className="pointer-events-none absolute -bottom-1 -top-1 rounded-[8px] bg-white/10 shadow-[0_0_0_2px_rgb(var(--accent-ink)),0_0_16px_rgb(var(--accent-ink)/0.35)]"
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

      <div className="relative mt-2 h-5 text-2xs tabular text-ink-faint" aria-hidden>
        {cfg.ticks.map((t, i) => {
          const edge = i === 0 ? 'left' : i === cfg.ticks.length - 1 ? 'right' : null
          return (
            <span
              key={t}
              className={cn(
                'absolute top-0 flex flex-col whitespace-nowrap',
                edge === 'left' ? 'left-0 items-start' : edge === 'right' ? 'right-0 items-end' : '-translate-x-1/2 items-center',
                night && i === 2 && 'text-accent-ink',
              )}
              style={edge ? undefined : { left: `${i * 25}%` }}
            >
              <span className={cn('mb-1 h-1.5 w-px bg-ink-faint/60', edge === 'left' && 'ml-px', edge === 'right' && 'mr-px')} />
              <span className="relative">
                {t}
                {/* The next day's date sits beside 12 AM without pulling the label off its tick */}
                {night && i === 2 && (
                  <span className="absolute left-full top-0 ml-1 whitespace-nowrap text-[10px] text-ink-faint">
                    {nextDay.split(' ')[0]}
                    <span className="hidden sm:inline"> {nextDay.split(' ')[1]}</span>
                  </span>
                )}
              </span>
            </span>
          )
        })}
      </div>
    </section>
  )
}

/**
 * A thin line of light hugging the capsule's lower edge, curving up around both rounded ends.
 * Drawn in SVG at the capsule's real width so the arcs keep their true radius at any size.
 * It overlaps the edge by about a pixel, so there's never a gap between the two.
 */
function EssenceLine({ half }: { half: Half }) {
  const ref = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(0)
  const gradientId = useId()

  useLayoutEffect(() => {
    const el = ref.current?.parentElement
    if (!el) return
    const update = () => setWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const r = STRIP_H / 2
  // The line's centre sits just inside the capsule edge, so the stroke straddles it and reads as
  // part of the pill's lower rim rather than something drawn next to it.
  const R = r - 0.5
  // Start at the very side of each rounded end (180°) and sweep down around the corner.
  const d =
    width > STRIP_H
      ? `M ${r - R} ${r} A ${R} ${R} 0 0 0 ${r} ${r + R} L ${width - r} ${r + R} A ${R} ${R} 0 0 0 ${width - r + R} ${r}`
      : ''
  const night = half === 'night'
  // Fade in along each curve: invisible where it starts at the side, full strength by the bottom.
  const fade = width > 0 ? r / width : 0

  return (
    <svg
      ref={ref}
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      style={{
        filter: night
          ? 'drop-shadow(0 0 2.5px rgb(129 128 255 / 0.45))'
          : 'drop-shadow(0 0 3px rgb(255 214 150 / 0.5))',
      }}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={width} y2="0">
          {LIGHT[half].map(([at, color, intensity]) => (
            // Brighter light reads as a stronger line; the darkest night stays faintly visible.
            <stop key={at} offset={at} stopColor={color} stopOpacity={0.3 + intensity * 0.65} />
          ))}
        </linearGradient>
        <linearGradient id={`${gradientId}-fade`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={width} y2="0">
          <stop offset={0} stopColor="#fff" stopOpacity={0} />
          <stop offset={fade * 0.35} stopColor="#fff" stopOpacity={0.35} />
          <stop offset={fade} stopColor="#fff" stopOpacity={1} />
          <stop offset={1 - fade} stopColor="#fff" stopOpacity={1} />
          <stop offset={1 - fade * 0.35} stopColor="#fff" stopOpacity={0.35} />
          <stop offset={1} stopColor="#fff" stopOpacity={0} />
        </linearGradient>
        <mask id={`${gradientId}-mask`} maskUnits="userSpaceOnUse" x={-4} y={-4} width={width + 8} height={STRIP_H + 8}>
          <rect x={-4} y={-4} width={width + 8} height={STRIP_H + 8} fill={`url(#${gradientId}-fade)`} />
        </mask>
      </defs>
      {d && (
        <path
          d={d}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={LINE_W}
          strokeLinecap="butt"
          mask={`url(#${gradientId}-mask)`}
        />
      )}
    </svg>
  )
}
