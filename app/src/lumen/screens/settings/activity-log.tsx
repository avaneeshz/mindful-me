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
import { EmptyState, Segmented } from '@/lumen/components/ui/primitives'
import { Button } from '@/lumen/components/ui/button'
import { cn } from '@/lumen/lib/utils'
import { SettingsPage } from './parts'

const PAGE = 100

/** Settings → Activity log (Lumen). Same data and hook as Classic's panel; only the screens differ. */
export function ActivityLogScreen({ onBack }: { onBack: () => void }) {
  const entries = useActivityLog()
  const [filter, setFilter] = useState<ActivityLogFilter>('all')
  const [shown, setShown] = useState(PAGE)
  const visible = useMemo(() => filterEntries(entries, filter), [entries, filter])
  const days = useMemo(() => groupByDay(visible.slice(0, shown)), [visible, shown])
  const problems = useMemo(() => entries.filter((entry) => entry.level === 'error').length, [entries])

  return (
    <SettingsPage eyebrow="Settings" title="Activity log" onBack={onBack}>
      <p className="text-sm text-ink-muted">
        Everything from the last 3 days — taps, what was saved on this device, and what was sent to or loaded from the
        server. Stays on this device and clears itself after 3 days.
      </p>

      <Segmented<ActivityLogFilter>
        label="Show"
        layoutId="activity-log-filter"
        className="sm:w-72"
        value={filter}
        onChange={(value) => {
          setFilter(value)
          setShown(PAGE)
        }}
        options={[
          { value: 'all', label: 'Everything' },
          { value: 'problems', label: problems ? `Problems (${problems})` : 'Problems' },
        ]}
      />

      {visible.length === 0 ? (
        <div className="surface rounded-card">
          <EmptyState
            icon={ScrollText}
            title={filter === 'problems' ? 'No problems in the last 3 days' : 'Nothing recorded yet'}
            body={filter === 'problems' ? 'Every save reached the server.' : 'What you do from now on will show up here.'}
          />
        </div>
      ) : (
        <>
          {days.map((day) => (
            <section key={day.day}>
              <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-[0.08em] text-ink-faint">
                {new Date(day.at).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
              </h2>
              <ul className="surface divide-y divide-line/[0.06] overflow-hidden rounded-card">
                {day.entries.map((entry) => (
                  <LogRow key={entry.id} entry={entry} />
                ))}
              </ul>
            </section>
          ))}
          {visible.length > shown && (
            <Button variant="quiet" onClick={() => setShown((n) => n + PAGE)}>
              Show older ({visible.length - shown} more)
            </Button>
          )}
        </>
      )}
    </SettingsPage>
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
        className="flex min-h-14 w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
      >
        <span aria-hidden="true" className={cn('mt-[7px] h-2 w-2 shrink-0 rounded-full', failed ? 'bg-danger' : 'bg-ink-faint')} />
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-[15px]', failed ? 'text-danger' : 'text-ink')}>{entry.summary}</span>
          <span className="block text-xs text-ink-muted">
            {new Date(entry.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
            {' · '}
            {ACTIVITY_LOG_KIND_LABEL[entry.kind]}
            {failed ? ' · Problem' : ''}
          </span>
        </span>
        {entry.detail && (
          <ChevronDown aria-hidden="true" className={cn('mt-1 h-4 w-4 shrink-0 text-ink-faint transition-transform', open && 'rotate-180')} />
        )}
      </button>
      {open && entry.detail && (
        <pre className="mx-4 mb-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white/[0.04] p-3 text-xs leading-relaxed text-ink">
          {entry.detail}
        </pre>
      )}
    </li>
  )
}
