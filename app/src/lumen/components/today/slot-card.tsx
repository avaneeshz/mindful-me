import { AnimatePresence, motion } from 'motion/react'
import { ChevronRight, CircleAlert, CircleCheck, CloudUpload, X } from 'lucide-react'
import { useState } from 'react'
import { IconBubble } from '@/lumen/components/ui/primitives'
import type { LumenTile } from '@/lumen/data/catalog'
import { axisClock, minutesWithin } from '@/lumen/domain/lumenDay'
import { FALLBACK_COLOR } from '@/lumen/lib/palette'
import { SLOT_MINUTES, useStore } from '@/lumen/lib/store'
import { addDays, cn, formatDuration, weekdayShort } from '@/lumen/lib/utils'

export function SlotCard() {
  const { selectedSlot, setSelectedSlot, nowSlot, isToday, today, setDay, day, tiles, catalogLoading, minutesByTile, freeStartIn, openLog } =
    useStore()
  const [lastTile, setLastTile] = useState<string | null>(null)
  const isNow = isToday && selectedSlot === nowSlot
  const freeStart = freeStartIn(selectedSlot)
  const full = freeStart === null
  const afterMidnight = selectedSlot >= 1440

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
            {axisClock(selectedSlot)} – {axisClock(selectedSlot + SLOT_MINUTES)}
            {afterMidnight && (
              <span className="ml-1.5 text-xs font-normal text-ink-faint">{weekdayShort(addDays(day, 1))}</span>
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
            onClick={() => (isToday ? setSelectedSlot(nowSlot) : setDay(today))}
            className="flex h-9 items-center gap-2 rounded-full border border-line/[0.1] bg-white/[0.03] px-3.5 text-xs font-medium text-ink-muted transition-colors hover:border-mint/40 hover:text-ink"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-mint" />
            Go to now
          </button>
        )}
      </div>

      <SlotEntries />

      {catalogLoading && tiles.length === 0 ? (
        <div className="mt-3 grid grid-cols-3 gap-2.5 sm:mt-4 sm:gap-3" aria-busy="true" aria-label="Loading your tiles">
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} className="min-h-[112px] animate-pulse rounded-tile bg-white/[0.03] sm:min-h-[124px]" />
          ))}
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2.5 sm:mt-4 sm:gap-3">
          {tiles.map((t, i) => (
            <TileButton
              key={t.id}
              tile={t}
              index={i}
              total={minutesByTile.get(t.id) ?? 0}
              disabled={full}
              highlighted={lastTile === t.id}
              onSelect={() => {
                if (freeStart === null) return
                setLastTile(t.id)
                openLog({ kind: 'new', tileId: t.id, start: freeStart })
              }}
            />
          ))}
        </div>
      )}
      {full && (
        <p className="mt-3 text-center text-xs text-ink-faint">This half-hour is full — pick another on the strips, or edit an entry above.</p>
      )}
      {!catalogLoading && tiles.length === 0 && (
        <p className="mt-3 rounded-tile border border-dashed border-line/10 px-4 py-6 text-center text-sm text-ink-muted">
          All tiles are hidden. Use Edit to bring some back.
        </p>
      )}
    </section>
  )
}

function TileButton({
  tile,
  index,
  total,
  disabled,
  highlighted,
  onSelect,
}: {
  tile: LumenTile
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
      transition={{ duration: 0.22, delay: Math.min(index, 12) * 0.025, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'group relative flex min-h-[112px] flex-col rounded-tile border p-3 text-left transition-[background-color,border-color,box-shadow,transform] duration-150 active:scale-[0.97] disabled:cursor-not-allowed sm:min-h-[124px] sm:p-4',
        highlighted
          ? 'border-accent-ink/50 bg-accent/[0.07] shadow-[0_0_0_3px_rgb(var(--lm-accent)/0.12)]'
          : 'border-line/[0.07] bg-surface-1/60 hover:border-line/[0.14] hover:bg-surface-2/80',
      )}
    >
      <IconBubble icon={tile.icon} color={tile.color.id} className="h-9 w-9 sm:h-10 sm:w-10 [&_svg]:h-[18px] [&_svg]:w-[18px] sm:[&_svg]:h-5 sm:[&_svg]:w-5" />
      <span className="mt-auto pt-3 text-sm font-medium leading-[18px] text-ink [overflow-wrap:break-word] max-[379px]:text-[13px] sm:text-[15px] sm:leading-5">
        {tile.label}
      </span>
      <span className="mt-1 flex items-center justify-between gap-1">
        <span className="truncate text-2xs tabular text-ink-faint">{total > 0 ? formatDuration(total) : '—'}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-ink-muted" />
      </span>
    </motion.button>
  )
}

/** Everything logged that touches the selected half-hour — tap to edit, ✕ to remove (with Undo). */
function SlotEntries() {
  const { slotItems, selectedSlot, tileOf, removeActivity, openLog, data } = useStore()
  return (
    <AnimatePresence initial={false}>
      {slotItems.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="mt-4 overflow-hidden"
        >
          <ul className="flex flex-col gap-1.5">
            <AnimatePresence initial={false}>
              {slotItems.map((item) => {
                const a = item.activity
                const tile = tileOf(a)
                const sync = data.syncStateOf(a.id)
                const here = minutesWithin(item, selectedSlot, selectedSlot + SLOT_MINUTES)
                const continues =
                  item.start < selectedSlot
                    ? `from ${axisClock(item.start)}`
                    : item.end > selectedSlot + SLOT_MINUTES
                      ? `until ${axisClock(item.end)}`
                      : null
                return (
                  <motion.li
                    key={a.id}
                    layout
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 6 }}
                    transition={{ duration: 0.18 }}
                    className="flex min-h-12 items-center gap-1 rounded-control bg-white/[0.03] pr-1"
                  >
                    <button
                      type="button"
                      onClick={() => openLog({ kind: 'edit', id: a.id })}
                      aria-label={`Edit ${a.name ?? 'entry'}`}
                      className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-control py-1.5 pl-2 text-left transition-colors hover:bg-white/[0.03]"
                    >
                      {tile ? (
                        <IconBubble icon={tile.icon} color={tile.color.id} size="sm" />
                      ) : (
                        <span className="h-8 w-8 shrink-0 rounded-full" style={{ backgroundColor: FALLBACK_COLOR.shades.bubble }} />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm text-ink">{a.name}</span>
                          {a.status === 'completed' && <CircleCheck className="h-3.5 w-3.5 shrink-0 text-mint" aria-label="Done" />}
                        </span>
                        {(a.path.length > 0 || continues) && (
                          <span className="block truncate text-xs text-ink-faint">
                            {[a.path.join(' · '), continues].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </span>
                      <SyncMark state={sync} />
                      <span className="text-sm tabular text-ink-muted">{formatDuration(here)}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeActivity(a.id)}
                      aria-label={`Remove ${a.name ?? 'entry'}`}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-faint transition-colors hover:bg-white/[0.06] hover:text-ink"
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

/** A quiet mark for an entry that hasn't reached the server yet; nothing once it has. */
export function SyncMark({ state }: { state: 'synced' | 'pending' | 'failed' }) {
  if (state === 'synced') return null
  if (state === 'failed') {
    return <CircleAlert className="h-4 w-4 shrink-0 text-danger" aria-label="Not synced — will retry" />
  }
  return <CloudUpload className="h-4 w-4 shrink-0 text-ink-faint" aria-label="Saving…" />
}

