import { AnimatePresence, motion } from 'motion/react'
import { Check, Minus, Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { IconBubble, ProgressRing } from '@/components/ui/primitives'
import { Sheet } from '@/components/ui/sheet'
import { metrics, type MetricDef } from '@/lib/data'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

export function MetricTiles() {
  const { day, hiddenMetrics } = useStore()
  const [openId, setOpenId] = useState<MetricDef['id'] | null>(null)
  const visible = metrics.filter((m) => !hiddenMetrics.includes(m.id))
  if (visible.length === 0) return null
  const open = metrics.find((m) => m.id === openId)

  return (
    <>
      <div
        className="grid gap-2.5 sm:gap-3"
        style={{ gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))` }}
      >
        {visible.map((m) => {
          const value = day.metrics[m.id]
          const pct = value / m.goal
          const done = pct >= 1
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setOpenId(m.id)}
              className={cn(
                'group relative flex min-h-[76px] flex-col items-start gap-2.5 overflow-hidden rounded-tile px-3 pb-3.5 pt-3 text-left sm:flex-row sm:items-center sm:gap-3 sm:py-3 transition-[border-color,background-color,transform] duration-150 active:scale-[0.98] sm:px-4',
                done
                  ? 'border border-mint/30 bg-[linear-gradient(160deg,rgb(var(--mint)/0.14),rgb(var(--mint)/0.04))] hover:border-mint/45'
                  : 'surface hover:border-line/[0.16]',
              )}
            >
              <IconBubble
                icon={done ? Check : m.icon}
                hue={done ? 'mint' : m.hue}
                className={cn('h-8 w-8 [&_svg]:!h-4 [&_svg]:!w-4 sm:h-11 sm:[&_svg]:!h-5 sm:[&_svg]:!w-5 sm:w-11', done && 'bg-mint/20')}
              />
              <div className="w-full min-w-0">
                <p className="truncate text-xs text-ink-muted sm:text-sm">{m.label}</p>
                <p className="mt-0.5 truncate text-lg font-medium tabular text-ink">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={value}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.18 }}
                      className="inline-block"
                    >
                      {value === 0 ? '—' : m.format(value)}
                    </motion.span>
                  </AnimatePresence>
                  <span className="ml-0.5 hidden text-sm font-normal text-ink-faint sm:inline">
                    {m.id === 'steps' ? '' : `/${m.format(m.goal)}${m.unit === 'g' ? 'g' : ''}`}
                  </span>
                </p>
              </div>
              {/* Goal progress as a hairline along the bottom edge */}
              <span className="absolute inset-x-3 bottom-0 h-[2px] overflow-hidden rounded-full bg-white/[0.04] sm:inset-x-4">
                <motion.span
                  className={cn('block h-full rounded-full', done ? 'bg-mint' : 'bg-accent-ink/70')}
                  initial={false}
                  animate={{ width: `${Math.min(100, pct * 100)}%` }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                />
              </span>
            </button>
          )
        })}
      </div>
      {open && <MetricSheet metric={open} onClose={() => setOpenId(null)} />}
    </>
  )
}

function MetricSheet({ metric, onClose }: { metric: MetricDef; onClose: () => void }) {
  const { day, setMetric } = useStore()
  const [open, setOpen] = useState(true)
  const [draft, setDraft] = useState(day.metrics[metric.id])
  const pct = draft / metric.goal
  const quick = metric.id === 'steps' ? [1000, 2500, 5000] : metric.id === 'water' ? [0.25, 0.5, 1] : [10, 25, 40]

  const close = () => {
    setOpen(false)
    window.setTimeout(onClose, 250)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && close()}
      title={metric.label}
      description={`Daily goal · ${metric.format(metric.goal)} ${metric.unit}`}
      leading={<IconBubble icon={metric.icon} hue={metric.hue} />}
      footer={
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={() => {
            setMetric(metric.id, draft)
            close()
          }}
        >
          Save
        </Button>
      }
    >
      <div className="flex flex-col items-center py-4">
        <ProgressRing value={pct} size={168} stroke={8} complete={pct >= 1}>
          <div className="text-center">
            <p className="text-3xl font-medium tabular text-ink">{metric.format(draft)}</p>
            <p className="mt-1 text-sm text-ink-muted">
              {pct >= 1 ? 'Goal reached' : `${Math.round(pct * 100)}% of goal`}
            </p>
          </div>
        </ProgressRing>
        <div className="mt-6 flex w-full items-center justify-center gap-4">
          <Button
            size="icon"
            className="h-12 w-12"
            aria-label={`Decrease by ${metric.format(metric.step)}`}
            disabled={draft <= 0}
            onClick={() => setDraft((d) => Math.max(0, +(d - metric.step).toFixed(2)))}
          >
            <Minus className="h-5 w-5" />
          </Button>
          <p className="w-24 text-center text-sm text-ink-muted">
            ±{metric.format(metric.step)} {metric.unit}
          </p>
          <Button
            size="icon"
            className="h-12 w-12"
            aria-label={`Increase by ${metric.format(metric.step)}`}
            onClick={() => setDraft((d) => +(d + metric.step).toFixed(2))}
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
        <div className="mt-6 grid w-full grid-cols-3 gap-2">
          {quick.map((q) => (
            <Button key={q} className="h-11 w-full rounded-control" onClick={() => setDraft((d) => +(d + q).toFixed(2))}>
              +{metric.format(q)} {metric.unit === 'steps' ? '' : metric.unit}
            </Button>
          ))}
        </div>
      </div>
    </Sheet>
  )
}
