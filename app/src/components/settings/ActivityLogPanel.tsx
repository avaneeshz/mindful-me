import { useMemo, useState } from 'react'
import { ChevronDown, ScrollText } from 'lucide-react'
import {
  ACTIVITY_LOG_KIND_LABEL,
  filterEntries,
  groupByDay,
  type ActivityLogEntry,
  type ActivityLogFilter,
} from '@/domain/activityLog'
import { useActivityLog } from '@/state/useActivityLog'
import { cn } from '@/lib/utils'

const PAGE = 100

/**
 * Settings → "Activity log": the last three days of what the user did and what
 * the app sent to / loaded from the server, newest first. One line per entry;
 * opening a row shows its complete content (the full note, the exact payload).
 * Kept on this device only.
 */
export function ActivityLogPanel() {
  const entries = useActivityLog()
  const [filter, setFilter] = useState<ActivityLogFilter>('all')
  const [shown, setShown] = useState(PAGE)
  const visible = useMemo(() => filterEntries(entries, filter), [entries, filter])
  const days = useMemo(() => groupByDay(visible.slice(0, shown)), [visible, shown])
  const problems = useMemo(() => entries.filter((entry) => entry.level === 'error').length, [entries])

  return (
    <div>
      <p className="text-caption text-ink-dim">
        Everything from the last 3 days — taps, what was saved on this device, and what was sent to or loaded from the
        server. Stays on this device and clears itself after 3 days.
      </p>

      <div role="group" aria-label="Show" className="mt-lg inline-flex rounded-md border border-line-soft p-xs">
        {(['all', 'problems'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => {
              setFilter(value)
              setShown(PAGE)
            }}
            className={cn(
              'rounded-sm px-md py-xs text-caption font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink',
              filter === value ? 'bg-ink text-surface' : 'text-ink-dim hover:text-ink',
            )}
          >
            {value === 'all' ? 'Everything' : `Problems${problems ? ` (${problems})` : ''}`}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="mt-lg rounded-md border border-line-soft bg-surface p-2xl text-center">
          <div className="mx-auto flex size-brand items-center justify-center rounded-full bg-ink/[0.06] text-ink">
            <ScrollText aria-hidden="true" className="size-[24px]" />
          </div>
          <p className="mt-lg text-body font-semibold text-ink">
            {filter === 'problems' ? 'No problems in the last 3 days' : 'Nothing recorded yet'}
          </p>
          <p className="mt-xs text-caption text-ink-dim">
            {filter === 'problems'
              ? 'Every save reached the server.'
              : 'What you do from now on will show up here.'}
          </p>
        </div>
      ) : (
        <>
          {days.map((day) => (
            <section key={day.day} className="mt-xl">
              <h3 className="text-caption font-semibold text-ink-dim">
                {new Date(day.at).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
              </h3>
              <ul className="mt-sm divide-y divide-line-soft overflow-hidden rounded-md border border-line-soft bg-surface">
                {day.entries.map((entry) => (
                  <LogRow key={entry.id} entry={entry} />
                ))}
              </ul>
            </section>
          ))}
          {visible.length > shown ? (
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE)}
              className="mt-lg w-full rounded-md border border-line-soft py-md text-caption font-medium text-ink transition-colors hover:border-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            >
              Show older ({visible.length - shown} more)
            </button>
          ) : null}
        </>
      )}
    </div>
  )
}

function LogRow({ entry }: { entry: ActivityLogEntry }) {
  const [open, setOpen] = useState(false)
  const failed = entry.level === 'error'
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-md px-lg py-md text-left transition-colors hover:bg-ink/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink"
      >
        <span
          aria-hidden="true"
          className={cn('mt-[7px] size-[8px] shrink-0 rounded-full', failed ? 'bg-ink' : 'bg-ink-dim/40')}
        />
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-caption', failed ? 'font-semibold text-ink' : 'text-ink')}>
            {entry.summary}
          </span>
          <span className="block text-[11px] text-ink-dim">
            {new Date(entry.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
            {' · '}
            {ACTIVITY_LOG_KIND_LABEL[entry.kind]}
            {failed ? ' · Problem' : ''}
          </span>
        </span>
        {entry.detail ? (
          <ChevronDown
            aria-hidden="true"
            className={cn('mt-1 size-[16px] shrink-0 text-ink-dim transition-transform', open && 'rotate-180')}
          />
        ) : null}
      </button>
      {open && entry.detail ? (
        <pre className="mx-lg mb-md max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-ink/[0.04] p-md text-[12px] leading-relaxed text-ink">
          {entry.detail}
        </pre>
      ) : null}
    </li>
  )
}
