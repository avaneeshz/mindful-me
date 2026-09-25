import { AnimatePresence, motion } from 'motion/react'
import { ChevronLeft, ChevronRight, Crosshair, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { IconBubble, ProgressBar } from '@/components/ui/primitives'
import { activityLabel, categories, categoryById, type Category } from '@/lib/data'
import { useStore } from '@/lib/store'
import { DAY_END_SLOT, DAY_FIRST_SLOT, NIGHT_FIRST_SLOT, SLOTS_PER_DAY, SLOT_MINUTES, addDays, cn, formatDay, formatDuration, slotRange } from '@/lib/utils'
import { ActivitySheet } from './activity-sheet'

export function SlotCard() {
  const { selectedSlot, setSelectedSlot, nowSlot, isToday, slotUsed, hiddenCategories, entries, date } = useStore()
  const [sheetCategory, setSheetCategory] = useState<Category | null>(null)
  const [lastCategory, setLastCategory] = useState<string | null>(null)
  const used = slotUsed(selectedSlot)
  const isNow = isToday && selectedSlot === nowSlot
  const isFuture = isToday && selectedSlot > nowSlot
  const full = used >= SLOT_MINUTES
  const visible = categories.filter((c) => !hiddenCategories.includes(c.id))

  const todayTotals = Object.fromEntries(
    categories.map((c) => [c.id, entries.filter((e) => e.categoryId === c.id).reduce((s, e) => s + e.minutes, 0)]),
  )

  const nextOpen = () => {
    for (let s = selectedSlot + 1; s < DAY_END_SLOT; s++) if (slotUsed(s) < SLOT_MINUTES) return s
    return null
  }

  return (
    <section id="slot-card" className="surface rounded-panel p-4 sm:p-6" aria-label="Selected time slot">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent/15 text-accent-ink sm:h-12 sm:w-12">
          <Crosshair className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.p
              key={selectedSlot}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="whitespace-nowrap text-2xl font-medium tabular tracking-[-0.03em] text-ink sm:text-3xl"
            >
              {slotRange(selectedSlot)}
            </motion.p>
          </AnimatePresence>
          <p className="mt-0.5 text-xs text-ink-muted">
            {selectedSlot < NIGHT_FIRST_SLOT ? 'Day' : 'Night'}
            {selectedSlot >= SLOTS_PER_DAY && ` · ${formatDay(addDays(date, 1))}`}
          </p>
        </div>
        <div className="-mr-1 hidden items-center sm:flex">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10"
            aria-label="Previous half-hour"
            disabled={selectedSlot <= DAY_FIRST_SLOT}
            onClick={() => setSelectedSlot(selectedSlot - 1)}
          >
            <ChevronLeft className="h-[18px] w-[18px]" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10"
            aria-label="Next half-hour"
            disabled={selectedSlot >= DAY_END_SLOT - 1}
            onClick={() => setSelectedSlot(selectedSlot + 1)}
          >
            <ChevronRight className="h-[18px] w-[18px]" />
          </Button>
        </div>
        {isNow ? (
          <span className="flex h-8 items-center gap-2 rounded-full px-1 text-xs font-semibold uppercase tracking-[0.1em] text-mint">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint/60" />
              <span className="relative h-2 w-2 rounded-full bg-mint" />
            </span>
            Now
          </span>
        ) : isToday ? (
          <button
            type="button"
            onClick={() => setSelectedSlot(nowSlot)}
            className="flex h-9 items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3.5 text-xs font-medium text-accent-ink transition-colors hover:bg-accent/20"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-mint" />
            Back to now
          </button>
        ) : (
          <span className="flex h-9 items-center rounded-full border border-accent/40 bg-accent/10 px-3.5 text-xs font-medium text-accent-ink">
            Selected slot
          </span>
        )}
      </div>

      {/* Capacity */}
      <div className="mt-5 flex items-center gap-4">
        <p className="shrink-0 text-sm text-ink-muted">
          <span className="font-medium tabular text-ink">{used}</span>
          <span className="tabular">/{SLOT_MINUTES} min used</span>
        </p>
        <ProgressBar value={used / SLOT_MINUTES} className="flex-1" />
      </div>

      <SlotEntries />

      {/* Categories */}
      <div className="mt-5 flex items-center justify-between">
        <p className="text-sm font-medium text-ink-muted">{isFuture ? 'Plan this half hour' : 'What filled this time?'}</p>
        {full && nextOpen() !== null && (
          <button
            type="button"
            onClick={() => setSelectedSlot(nextOpen()!)}
            className="flex h-9 items-center gap-1 rounded-full px-2 text-xs font-medium text-accent-ink hover:bg-white/[0.05]"
          >
            Next open slot <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2.5 sm:gap-3">
        {visible.map((c, i) => (
          <CategoryTile
            key={c.id}
            category={c}
            index={i}
            total={todayTotals[c.id]}
            disabled={full}
            highlighted={lastCategory === c.id}
            onSelect={() => {
              setLastCategory(c.id)
              setSheetCategory(c)
            }}
          />
        ))}
      </div>
      {visible.length === 0 && (
        <p className="mt-3 rounded-tile border border-dashed border-line/10 px-4 py-6 text-center text-sm text-ink-muted">
          All categories are hidden. Use Edit to bring some back.
        </p>
      )}

      <ActivitySheet
        category={sheetCategory}
        open={sheetCategory !== null}
        onOpenChange={(o) => !o && setSheetCategory(null)}
      />
    </section>
  )
}

function CategoryTile({
  category,
  index,
  total,
  disabled,
  highlighted,
  onSelect,
}: {
  category: Category
  index: number
  total: number
  disabled: boolean
  highlighted: boolean
  onSelect: () => void
}) {
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: disabled ? 0.4 : 1, y: 0 }}
      transition={{ duration: 0.22, delay: index * 0.025, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'group relative flex min-h-[112px] flex-col rounded-tile border p-3 text-left transition-[background-color,border-color,box-shadow,transform] duration-150 active:scale-[0.97] disabled:cursor-not-allowed sm:min-h-[124px] sm:p-4',
        highlighted
          ? 'border-accent-ink/50 bg-accent/[0.07] shadow-[0_0_0_3px_rgb(var(--accent)/0.12)]'
          : 'border-line/[0.07] bg-surface-1/60 hover:border-line/[0.14] hover:bg-surface-2/80',
      )}
    >
      <IconBubble icon={category.icon} hue={category.hue} className="h-9 w-9 sm:h-10 sm:w-10 [&_svg]:h-[18px] [&_svg]:w-[18px] sm:[&_svg]:h-5 sm:[&_svg]:w-5" />
      <span className="mt-auto pt-3 text-sm font-medium leading-[18px] text-ink [overflow-wrap:anywhere] sm:text-[15px] sm:leading-5">
        {category.label}
      </span>
      <span className="mt-1 flex items-center justify-between gap-1">
        <span className="truncate text-2xs tabular text-ink-faint">{total > 0 ? formatDuration(total) : '—'}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-ink-muted" />
      </span>
    </motion.button>
  )
}

function SlotEntries() {
  const { slotEntries, removeEntry } = useStore()
  return (
    <AnimatePresence initial={false}>
      {slotEntries.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="mt-4 overflow-hidden"
        >
          <ul className="flex flex-col gap-1.5">
            <AnimatePresence initial={false}>
              {slotEntries.map((e) => {
                const c = categoryById[e.categoryId]
                return (
                  <motion.li
                    key={e.id}
                    layout
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 6 }}
                    transition={{ duration: 0.18 }}
                    className="flex min-h-12 items-center gap-3 rounded-control bg-white/[0.03] py-1.5 pl-2 pr-1"
                  >
                    <IconBubble icon={c.icon} hue={c.hue} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">{activityLabel(e.categoryId, e.activityId)}</p>
                    </div>
                    <span className="text-sm tabular text-ink-muted">{e.minutes}m</span>
                    <button
                      type="button"
                      onClick={() => removeEntry(e.id)}
                      aria-label={`Remove ${activityLabel(e.categoryId, e.activityId)}`}
                      className="grid h-10 w-10 place-items-center rounded-full text-ink-faint transition-colors hover:bg-white/[0.06] hover:text-ink"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
