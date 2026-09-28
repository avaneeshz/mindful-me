import { AnimatePresence, motion } from 'motion/react'
import { ChevronRight, X } from 'lucide-react'
import { useState } from 'react'
import { IconBubble } from '@/components/ui/primitives'
import { activityLabel, categories, categoryById, type Category } from '@/lib/data'
import { useStore } from '@/lib/store'
import { SLOTS_PER_DAY, SLOT_MINUTES, addDays, cn, formatDuration, fromKey, slotRange, todayKey } from '@/lib/utils'
import { ActivitySheet } from './activity-sheet'

export function SlotCard() {
  const { selectedSlot, setSelectedSlot, nowSlot, isToday, slotUsed, hiddenCategories, entries, date, setDate } = useStore()
  const [sheetCategory, setSheetCategory] = useState<Category | null>(null)
  const [lastCategory, setLastCategory] = useState<string | null>(null)
  const isNow = isToday && selectedSlot === nowSlot
  const full = slotUsed(selectedSlot) >= SLOT_MINUTES
  const visible = categories.filter((c) => !hiddenCategories.includes(c.id))

  const todayTotals = Object.fromEntries(
    categories.map((c) => [c.id, entries.filter((e) => e.categoryId === c.id).reduce((s, e) => s + e.minutes, 0)]),
  )

  return (
    <section id="slot-card" className="surface rounded-panel p-4 sm:p-6" aria-label="Selected time slot">
      {/* Just the selected half-hour, and a way back to now */}
      <div className="flex min-h-9 items-center justify-between gap-3">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.p
            key={selectedSlot}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="whitespace-nowrap text-sm font-medium tabular text-ink-muted"
          >
            {slotRange(selectedSlot)}
            {selectedSlot >= SLOTS_PER_DAY && (
              <span className="ml-1.5 text-xs font-normal text-ink-faint">
                {fromKey(addDays(date, 1)).toLocaleDateString('en-GB', { weekday: 'short' })}
              </span>
            )}
          </motion.p>
        </AnimatePresence>
        {isNow ? (
          <span className="flex h-9 items-center gap-2 px-1 text-xs font-semibold uppercase tracking-[0.1em] text-mint" aria-current="time">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint/60" />
              <span className="relative h-2 w-2 rounded-full bg-mint" />
            </span>
            Now
          </span>
        ) : (
          <button
            type="button"
            onClick={() => (isToday ? setSelectedSlot(nowSlot) : setDate(todayKey()))}
            className="flex h-9 items-center gap-2 rounded-full border border-line/[0.1] bg-white/[0.03] px-3.5 text-xs font-medium text-ink-muted transition-colors hover:border-mint/40 hover:text-ink"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-mint" />
            Go to now
          </button>
        )}
      </div>

      <SlotEntries />

      <div className="mt-3 grid grid-cols-3 gap-2.5 sm:mt-4 sm:gap-3">
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
      <IconBubble icon={category.icon} color={category.color} className="h-9 w-9 sm:h-10 sm:w-10 [&_svg]:h-[18px] [&_svg]:w-[18px] sm:[&_svg]:h-5 sm:[&_svg]:w-5" />
      <span className="mt-auto pt-3 text-sm font-medium leading-[18px] text-ink [overflow-wrap:break-word] max-[379px]:text-[13px] sm:text-[15px] sm:leading-5">
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
                    <IconBubble icon={c.icon} color={c.color} size="sm" />
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
