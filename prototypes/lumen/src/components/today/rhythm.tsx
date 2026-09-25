import { motion } from 'motion/react'
import { Moon, Sun } from 'lucide-react'
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { useStore } from '@/lib/store'
import { cn, formatClock } from '@/lib/utils'

type Kind = 'wake' | 'windDown'

const config: Record<Kind, { label: string; start: number; end: number; icon: typeof Sun }> = {
  wake: { label: 'Wake up', start: 5 * 60, end: 10 * 60, icon: Sun },
  windDown: { label: 'Wind down', start: 20 * 60, end: 25 * 60, icon: Moon },
}

const SNAP = 15

export function RhythmCards() {
  return (
    <div className="grid grid-cols-1 gap-3">
      <RhythmCard kind="wake" />
      <RhythmCard kind="windDown" />
    </div>
  )
}

function RhythmCard({ kind }: { kind: Kind }) {
  const { day, setRhythm } = useStore()
  const cfg = config[kind]
  const raw = kind === 'windDown' && day.windDown < 12 * 60 ? day.windDown + 1440 : day[kind]
  const value = Math.min(cfg.end, Math.max(cfg.start, raw))
  const { time, suffix } = formatClock(value)
  const Icon = cfg.icon
  const morning = kind === 'wake'

  return (
    <section className="surface flex items-center gap-4 rounded-card px-4 py-4 sm:gap-5 sm:px-5">
      <span
        className={cn(
          'relative grid h-12 w-12 shrink-0 place-items-center rounded-full sm:h-14 sm:w-14',
          morning
            ? 'bg-[radial-gradient(circle_at_35%_30%,#FFD68A_0%,#F9A43B_55%,#E77F2A_100%)] text-[#5A2A06] shadow-[0_0_24px_-4px_rgb(249_164_59/0.55)]'
            : 'bg-[radial-gradient(circle_at_35%_30%,#8E90FF_0%,#5B5CE0_55%,#3D3AB5_100%)] text-white shadow-[0_0_24px_-4px_rgb(99_102_241/0.55)]',
        )}
        aria-hidden
      >
        <Icon className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={1.9} />
      </span>
      <div className="w-[92px] shrink-0 sm:w-[112px]">
        <p className="text-sm text-ink-muted">{cfg.label}</p>
        <p className="mt-0.5 whitespace-nowrap text-xl font-medium tabular text-ink sm:text-2xl">
          {time}
          <span className="ml-1 text-sm font-normal text-ink-muted sm:text-base">{suffix}</span>
        </p>
      </div>
      <Track kind={kind} value={value} onChange={(v) => setRhythm(kind, v >= 1440 ? v - 1440 : v)} />
    </section>
  )
}

function Track({ kind, value, onChange }: { kind: Kind; value: number; onChange: (v: number) => void }) {
  const cfg = config[kind]
  const ref = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const span = cfg.end - cfg.start
  const pct = ((value - cfg.start) / span) * 100
  const hours = Array.from({ length: span / 60 + 1 }, (_, i) => cfg.start + i * 60)
  const morning = kind === 'wake'
  const Icon = morning ? Sun : Moon

  const fromPointer = (clientX: number) => {
    const rect = ref.current!.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    onChange(cfg.start + Math.round((ratio * span) / SNAP) * SNAP)
  }
  const onPointerDown = (e: PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
    fromPointer(e.clientX)
  }
  const onKey = (e: KeyboardEvent) => {
    const delta = { ArrowLeft: -SNAP, ArrowDown: -SNAP, ArrowRight: SNAP, ArrowUp: SNAP }[e.key]
    if (delta) {
      e.preventDefault()
      onChange(Math.min(cfg.end, Math.max(cfg.start, value + delta)))
    }
  }
  const label = (m: number) => {
    const h = Math.floor((m / 60) % 24)
    const h12 = h % 12 === 0 ? 12 : h % 12
    return String(h12)
  }

  return (
    <div className="min-w-0 flex-1 pt-5">
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label={`${cfg.label} time`}
        aria-valuemin={cfg.start}
        aria-valuemax={cfg.end}
        aria-valuenow={value}
        aria-valuetext={`${formatClock(value).time} ${formatClock(value).suffix}`}
        onPointerDown={onPointerDown}
        onPointerMove={(e) => dragging && fromPointer(e.clientX)}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onKeyDown={onKey}
        className="group relative -my-3 cursor-pointer touch-none py-3 outline-none"
      >
        {/* Rail */}
        <div className="relative h-2.5 rounded-full bg-white/[0.05]">
          <div
            className={cn(
              'absolute inset-0 rounded-full opacity-[0.22]',
              morning
                ? 'bg-[linear-gradient(90deg,#F9B84A,#E9C07E_45%,#8DB8F2_80%,#6AA6FA)]'
                : 'bg-[linear-gradient(90deg,#6B6EF0,#4E4FC4_60%,#2B2E6E)]',
            )}
          />
          <motion.div
            className={cn(
              'absolute inset-y-0 left-0 rounded-full',
              morning
                ? 'bg-[linear-gradient(90deg,#F9B84A,#E9C07E_45%,#8DB8F2_80%,#6AA6FA)]'
                : 'bg-[linear-gradient(90deg,#7477F5,#5557D6_60%,#3B3E9C)]',
            )}
            style={{ backgroundSize: `${(100 / Math.max(pct, 1)) * 100}% 100%` }}
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={dragging ? { duration: 0 } : { duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          />
          {/* Hour ticks */}
          {hours.slice(1, -1).map((m) => (
            <span
              key={m}
              className="absolute top-1/2 h-1 w-px -translate-y-1/2 bg-canvas/50"
              style={{ left: `${((m - cfg.start) / span) * 100}%` }}
            />
          ))}
          {/* Thumb */}
          <motion.span
            className="absolute top-1/2"
            initial={false}
            animate={{ left: `${pct}%` }}
            transition={dragging ? { duration: 0 } : { duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <span
              className={cn(
                'absolute left-0 top-0 block h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-canvas transition-transform duration-150 group-focus-visible:ring-2 group-focus-visible:ring-accent-ink',
                morning ? 'border-sun' : 'border-accent-ink',
                dragging ? 'scale-110' : 'group-hover:scale-105',
              )}
            />
            <Icon
              className={cn('absolute -top-[26px] h-4 w-4 -translate-x-1/2', morning ? 'text-sun' : 'text-accent-ink')}
              strokeWidth={2}
              aria-hidden
            />
          </motion.span>
        </div>
      </div>
      <div className="relative mt-2.5 h-4 text-2xs tabular text-ink-faint">
        {hours.map((m, i) => (
          <span
            key={m}
            className={cn(
              'absolute top-0',
              i === 0 ? 'left-0' : i === hours.length - 1 ? 'right-0' : '-translate-x-1/2',
            )}
            style={i === 0 || i === hours.length - 1 ? undefined : { left: `${((m - cfg.start) / span) * 100}%` }}
          >
            {label(m)}
          </span>
        ))}
      </div>
    </div>
  )
}
