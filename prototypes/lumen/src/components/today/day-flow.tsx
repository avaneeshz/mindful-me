import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown, Hourglass } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EmptyState, IconBubble, SectionTitle } from '@/components/ui/primitives'
import { activityLabel, categories, categoryById, hueStyles, type Entry } from '@/lib/data'
import { useStore } from '@/lib/store'
import { cn, formatDuration, slotStart } from '@/lib/utils'

type Block = { key: string; categoryId: string; activityId: string; startSlot: number; minutes: number }

/** Merge consecutive slots doing the same thing into one readable block. */
function toBlocks(entries: Entry[]): Block[] {
  const sorted = [...entries].sort((a, b) => a.slot - b.slot)
  const blocks: (Block & { lastSlot: number })[] = []
  for (const e of sorted) {
    // Only merge into a block that ended in this or the previous slot.
    const prev = [...blocks].reverse().find((b) => b.activityId === e.activityId && e.slot - b.lastSlot <= 1)
    if (prev) {
      prev.minutes += e.minutes
      prev.lastSlot = e.slot
    } else {
      blocks.push({ key: e.id, categoryId: e.categoryId, activityId: e.activityId, startSlot: e.slot, lastSlot: e.slot, minutes: e.minutes })
    }
  }
  return blocks
}

export function DayFlow() {
  const { entries, setSelectedSlot, selectedSlot, isToday } = useStore()
  const [expanded, setExpanded] = useState(false)
  const blocks = useMemo(() => toBlocks(entries).reverse(), [entries])
  const total = entries.reduce((s, e) => s + e.minutes, 0)
  const byCategory = categories
    .map((c) => ({ c, minutes: entries.filter((e) => e.categoryId === c.id).reduce((s, e) => s + e.minutes, 0) }))
    .filter((x) => x.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)
  const shown = expanded ? blocks : blocks.slice(0, 6)

  const jump = (slot: number) => {
    setSelectedSlot(slot)
    document.getElementById('slot-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <section className="surface rounded-card p-4 sm:p-5">
      <SectionTitle action={total > 0 && <span className="text-sm tabular text-ink-muted">{formatDuration(total)} logged</span>}>
        {isToday ? 'Where today went' : 'Where the day went'}
      </SectionTitle>

      {total === 0 ? (
        <EmptyState
          icon={Hourglass}
          title="A blank page"
          body={isToday ? 'Log the last half hour to start seeing the shape of your day.' : 'Nothing was logged on this day.'}
        />
      ) : (
        <>
          {/* Distribution */}
          <div className="mt-3 flex h-2.5 gap-[3px] overflow-hidden rounded-full">
            {byCategory.map(({ c, minutes }) => (
              <motion.span
                key={c.id}
                className={cn('h-full first:rounded-l-full last:rounded-r-full', hueStyles[c.hue].bar)}
                initial={false}
                animate={{ flexGrow: minutes }}
                style={{ flexBasis: 0 }}
                transition={{ duration: 0.3 }}
                title={`${c.short} · ${formatDuration(minutes)}`}
              />
            ))}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {byCategory.slice(0, 5).map(({ c, minutes }) => (
              <li key={c.id} className="flex items-center gap-1.5 text-xs text-ink-muted">
                <span className={cn('h-1.5 w-1.5 rounded-full', hueStyles[c.hue].bar)} />
                {c.short}
                <span className="tabular text-ink-faint">{formatDuration(minutes)}</span>
              </li>
            ))}
          </ul>

          {/* Recent blocks, newest first */}
          <ol className="relative mt-5">
            <span className="absolute bottom-5 left-[19px] top-5 w-px bg-line/[0.08]" aria-hidden />
            <AnimatePresence initial={false}>
              {shown.map((b) => {
                const c = categoryById[b.categoryId]
                const active = b.startSlot === selectedSlot
                return (
                  <motion.li
                    key={b.key}
                    layout="position"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <button
                      type="button"
                      onClick={() => jump(b.startSlot)}
                      className={cn(
                        'relative flex min-h-14 w-full items-center gap-3 rounded-control py-2 pr-2 text-left transition-colors',
                        active ? 'bg-white/[0.04]' : 'hover:bg-white/[0.03]',
                      )}
                    >
                      <IconBubble icon={c.icon} hue={c.hue} className="ring-4 ring-surface-1" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-ink">{activityLabel(b.categoryId, b.activityId)}</p>
                        <p className="text-xs text-ink-faint">{c.label}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm tabular text-ink">{slotStart(b.startSlot)}</p>
                        <p className="text-xs tabular text-ink-faint">{formatDuration(b.minutes)}</p>
                      </div>
                    </button>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ol>
          {blocks.length > 6 && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-control text-sm font-medium text-ink-muted transition-colors hover:bg-white/[0.03] hover:text-ink"
              aria-expanded={expanded}
            >
              {expanded ? 'Show less' : `Show all ${blocks.length}`}
              <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', expanded && 'rotate-180')} />
            </button>
          )}
        </>
      )}
    </section>
  )
}
