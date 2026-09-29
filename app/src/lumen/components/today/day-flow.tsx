import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown, CircleCheck, Hourglass } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EmptyState, IconBubble, SectionTitle } from '@/lumen/components/ui/primitives'
import { activitiesWithin, axisClock, LUMEN_DAY_END, LUMEN_DAY_START, minutesWithin } from '@/lumen/domain/lumenDay'
import { FALLBACK_COLOR } from '@/lumen/lib/palette'
import { useStore } from '@/lumen/lib/store'
import { cn, formatDuration } from '@/lumen/lib/utils'
import { SyncMark } from './slot-card'

const COLLAPSED_COUNT = 6

/** The shape of the Lumen day: time per tile, and every entry, newest first. */
export function DayFlow() {
  const { axis, allTiles, minutesByTile, totalLogged, isToday, tileOf, openLog, data } = useStore()
  const [expanded, setExpanded] = useState(false)

  const entries = useMemo(() => activitiesWithin(axis, LUMEN_DAY_START, LUMEN_DAY_END).reverse(), [axis])
  const byTile = useMemo(
    () =>
      [
        ...allTiles.map((t) => ({ id: t.id, short: t.short, color: t.color.shades.base, minutes: minutesByTile.get(t.id) ?? 0 })),
        { id: 'other', short: 'Other', color: FALLBACK_COLOR.shades.base, minutes: minutesByTile.get('other') ?? 0 },
      ]
        .filter((x) => x.minutes > 0)
        .sort((a, b) => b.minutes - a.minutes),
    [allTiles, minutesByTile],
  )
  const shown = expanded ? entries : entries.slice(0, COLLAPSED_COUNT)

  return (
    <section className="surface rounded-card p-4 sm:p-5">
      <SectionTitle action={totalLogged > 0 && <span className="text-sm tabular text-ink-muted">{formatDuration(totalLogged)} logged</span>}>
        {isToday ? 'Where today went' : 'Where the day went'}
      </SectionTitle>

      {totalLogged === 0 ? (
        <EmptyState
          icon={Hourglass}
          title="A blank page"
          body={isToday ? 'Log the last half hour to start seeing the shape of your day.' : 'Nothing was logged on this day.'}
        />
      ) : (
        <>
          {/* Distribution */}
          <div className="mt-3 flex h-2.5 gap-[3px] overflow-hidden rounded-full">
            {byTile.map((t) => (
              <motion.span
                key={t.id}
                className="h-full first:rounded-l-full last:rounded-r-full"
                initial={false}
                animate={{ flexGrow: t.minutes }}
                style={{ flexBasis: 0, backgroundColor: t.color }}
                transition={{ duration: 0.3 }}
                title={`${t.short} · ${formatDuration(t.minutes)}`}
              />
            ))}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {byTile.slice(0, 5).map((t) => (
              <li key={t.id} className="flex items-center gap-1.5 text-xs text-ink-muted">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.color }} />
                {t.short}
                <span className="tabular text-ink-faint">{formatDuration(t.minutes)}</span>
              </li>
            ))}
          </ul>

          {/* Every entry, newest first */}
          <ol className="relative mt-5">
            <span className="absolute bottom-5 left-[19px] top-5 w-px bg-line/[0.08]" aria-hidden />
            <AnimatePresence initial={false}>
              {shown.map((item) => {
                const a = item.activity
                const tile = tileOf(a)
                const minutes = minutesWithin(item, LUMEN_DAY_START, LUMEN_DAY_END)
                return (
                  <motion.li
                    key={a.id}
                    layout="position"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <button
                      type="button"
                      onClick={() => openLog({ kind: 'edit', id: a.id })}
                      aria-label={`Edit ${a.name ?? 'entry'}, ${axisClock(item.start)}`}
                      className="relative flex min-h-14 w-full items-center gap-3 rounded-control py-2 pr-2 text-left transition-colors hover:bg-white/[0.03]"
                    >
                      {tile ? (
                        <IconBubble icon={tile.icon} color={tile.color.id} className="ring-4 ring-surface-1" />
                      ) : (
                        <span className="h-10 w-10 shrink-0 rounded-full ring-4 ring-surface-1" style={{ backgroundColor: FALLBACK_COLOR.shades.bubble }} />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-sm text-ink">
                          <span className="truncate">{a.name}</span>
                          {a.status === 'completed' && <CircleCheck className="h-3.5 w-3.5 shrink-0 text-mint" aria-label="Done" />}
                        </p>
                        <p className="truncate text-xs text-ink-faint">{[tile?.label, a.path.join(' · ')].filter(Boolean).join(' · ')}</p>
                      </div>
                      <SyncMark state={data.syncStateOf(a.id)} />
                      <div className="text-right">
                        <p className={cn('text-sm tabular text-ink')}>{axisClock(item.start)}</p>
                        <p className="text-xs tabular text-ink-faint">{formatDuration(minutes)}</p>
                      </div>
                    </button>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ol>
          {entries.length > COLLAPSED_COUNT && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-control text-sm font-medium text-ink-muted transition-colors hover:bg-white/[0.03] hover:text-ink"
              aria-expanded={expanded}
            >
              {expanded ? 'Show less' : `Show all ${entries.length}`}
              <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', expanded && 'rotate-180')} />
            </button>
          )}
        </>
      )}
    </section>
  )
}
