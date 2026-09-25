import { AnimatePresence, motion } from 'motion/react'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { IconBubble, Segmented } from '@/components/ui/primitives'
import { Sheet } from '@/components/ui/sheet'
import { categories, type Category } from '@/lib/data'
import { useStore } from '@/lib/store'
import { SLOT_MINUTES, cn, slotRange } from '@/lib/utils'

const DURATIONS = [5, 10, 15, 20, 30]

/**
 * Log an activity into the selected slot.
 * With no category it opens on a category picker first (the "+" entry point).
 */
export function ActivitySheet({
  category: initial,
  open,
  onOpenChange,
}: {
  category: Category | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { selectedSlot, slotUsed, logActivity, hiddenCategories } = useStore()
  const [category, setCategory] = useState<Category | null>(initial)
  const [activityId, setActivityId] = useState<string | null>(null)
  const [minutes, setMinutes] = useState(15)
  const remaining = SLOT_MINUTES - slotUsed(selectedSlot)

  // Reset whenever the sheet opens for a (possibly different) category.
  useEffect(() => {
    if (!open) return
    setCategory(initial)
    setActivityId(null)
  }, [open, initial])

  const pickActivity = (id: string, suggested: number) => {
    setActivityId(id)
    setMinutes(Math.min(remaining, DURATIONS.reduce((best, d) => (Math.abs(d - suggested) < Math.abs(best - suggested) ? d : best))))
  }

  const pickable = categories.filter((c) => !hiddenCategories.includes(c.id))
  const step = category ? 'activity' : 'category'
  const fits = DURATIONS.filter((d) => d <= remaining)
  const effective = Math.min(minutes, remaining)

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={category ? category.label : 'Log activity'}
      description={
        <span className="tabular">
          {slotRange(selectedSlot)} · {remaining > 0 ? `${remaining} min free` : 'slot full'}
        </span>
      }
      leading={
        category ? (
          initial ? (
            <IconBubble icon={category.icon} hue={category.hue} />
          ) : (
            <Button variant="ghost" size="icon" className="-ml-2 h-10 w-10" aria-label="Back to categories" onClick={() => setCategory(null)}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
          )
        ) : undefined
      }
      footer={
        step === 'activity' ? (
          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-2 text-xs font-medium text-ink-muted">Duration</p>
              <Segmented
                label="Duration"
                layoutId="duration"
                value={effective}
                onChange={setMinutes}
                options={DURATIONS.map((d) => ({ value: d, label: `${d}m`, disabled: d > remaining }))}
              />
            </div>
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              disabled={!activityId || fits.length === 0}
              onClick={() => {
                if (!category || !activityId) return
                logActivity({ categoryId: category.id, activityId, minutes: effective })
                onOpenChange(false)
              }}
            >
              {activityId ? `Log ${effective} min` : 'Choose an activity'}
            </Button>
          </div>
        ) : undefined
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        {step === 'category' ? (
          <motion.div
            key="cats"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18 }}
            className="grid grid-cols-1 gap-1"
          >
            {pickable.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c)}
                className="flex min-h-14 items-center gap-3 rounded-control px-2 text-left transition-colors hover:bg-white/[0.04] active:bg-white/[0.07]"
              >
                <IconBubble icon={c.icon} hue={c.hue} />
                <span className="flex-1 text-[15px] text-ink">{c.label}</span>
                <span className="text-xs text-ink-faint">{c.activities.length} activities</span>
                <ChevronRight className="h-4 w-4 text-ink-faint" />
              </button>
            ))}
          </motion.div>
        ) : (
          <motion.ul
            key={category!.id}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.18 }}
            role="radiogroup"
            aria-label="Activity"
            className="flex flex-col gap-1.5"
          >
            {category!.activities.map((a) => {
              const selected = a.id === activityId
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => pickActivity(a.id, a.minutes)}
                    className={cn(
                      'flex min-h-14 w-full items-center gap-3 rounded-control border px-4 text-left transition-colors duration-150',
                      selected
                        ? 'border-accent-ink/50 bg-accent/10'
                        : 'border-line/[0.07] bg-white/[0.02] hover:border-line/[0.14] hover:bg-white/[0.04]',
                    )}
                  >
                    <span className="flex-1 text-[15px] text-ink">{a.label}</span>
                    <span className="text-xs tabular text-ink-faint">usually {a.minutes}m</span>
                    <span
                      className={cn(
                        'grid h-5 w-5 place-items-center rounded-full border transition-colors',
                        selected ? 'border-accent bg-accent text-white' : 'border-line/20',
                      )}
                    >
                      {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                  </button>
                </li>
              )
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </Sheet>
  )
}
