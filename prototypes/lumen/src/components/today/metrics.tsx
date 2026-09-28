import { AnimatePresence, motion } from 'motion/react'
import { Check, Minus, Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { IconBubble, ProgressRing } from '@/components/ui/primitives'
import { Sheet } from '@/components/ui/sheet'
import { hueStyles, metrics, type MetricDef } from '@/lib/data'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { CustomizeSheet } from './customize-sheet'

/**
 * Daily metrics as compact chips that only take the room they need, so the
 * row can grow as people add more metrics. Wraps onto a second line when full.
 */
export function MetricTiles() {
  const { day, hiddenMetrics } = useStore()
  const [openId, setOpenId] = useState<MetricDef['id'] | null>(null)
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const visible = metrics.filter((m) => !hiddenMetrics.includes(m.id))
  const open = metrics.find((m) => m.id === openId)

  return (
    <>
      {/* Phones: one row that scrolls sideways once it's full. Larger screens: wrap. */}
      <div className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {visible.map((m) => {
          const value = day.metrics[m.id]
          const pct = value / m.goal
          const done = pct >= 1
          const Icon = done ? Check : m.icon
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setOpenId(m.id)}
              aria-label={`${m.label}: ${value === 0 ? 'not logged' : `${m.format(value)} of ${m.format(m.goal)} ${m.unit}`}`}
              className={cn(
                'flex h-11 shrink-0 items-center gap-2 rounded-full border py-1 pl-1 pr-3.5 transition-[border-color,background-color,transform] duration-150 active:scale-[0.97]',
                done
                  ? 'border-mint/30 bg-mint/[0.08] hover:border-mint/45'
                  : 'border-line/[0.09] bg-surface-1/70 hover:border-line/[0.16] hover:bg-surface-2',
              )}
            >
              <ProgressRing value={pct} size={34} stroke={2.5} complete={done}>
                <Icon className={cn('h-4 w-4', done ? 'text-mint' : hueStyles[m.hue].icon)} strokeWidth={2} />
              </ProgressRing>
              <span className="hidden text-sm text-ink-muted sm:inline">{m.label}</span>
              <span className="text-sm font-medium tabular text-ink">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={value}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.16 }}
                    className="inline-block"
                  >
                    {value === 0 ? '—' : m.format(value)}
                  </motion.span>
                </AnimatePresence>
              </span>
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => setCustomizeOpen(true)}
          aria-label="Add or hide metrics"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-dashed border-line/20 text-ink-muted transition-colors hover:border-line/30 hover:bg-white/[0.04] hover:text-ink"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {open && <MetricSheet metric={open} onClose={() => setOpenId(null)} />}
      <CustomizeSheet open={customizeOpen} onOpenChange={setCustomizeOpen} />
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
