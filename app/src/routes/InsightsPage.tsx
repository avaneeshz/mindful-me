import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Loader2, Sparkles } from 'lucide-react'
import { CATEGORIES, categoryOf } from '@/data/activities'
import { addDays, startOfWeek } from '@/domain/calendar'
import {
  bucketByCalendarWeek,
  CATEGORY_ORDER,
  formatDurationMinutes,
  sumDayTotals,
  type DayTotals,
} from '@/domain/insights'
import type { CategoryId, ScheduledActivity } from '@/domain/types'
import { classifyInsightsView } from '@/state/insightsData'
import { useInsightsDays } from '@/state/useInsightsDays'
import { useBoard } from '@/state/BoardContext'
import { localDateISO, localDayRange } from '@/lib/localTime'
import { cn } from '@/lib/utils'
import { chipVariants } from '@/components/ui/chip'
import { Meter } from '@/components/ui/meter'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/DatePicker'
import { CategoryTotalsChart } from '@/components/insights/CategoryTotalsChart'
import { CompletionSection } from '@/components/insights/CompletionSection'
import { TrendChart, type TrendPoint } from '@/components/insights/TrendChart'

type Granularity = 'day' | 'week'

function categoryIdOf(activity: ScheduledActivity): CategoryId {
  return categoryOf(activity.name ?? '').id
}

const DAY_TREND_LENGTH = 14
const WEEK_TREND_LENGTH = 8 * 7

export function InsightsPage() {
  const { now } = useBoard()
  const [granularity, setGranularity] = useState<Granularity>('day')
  const [selectedDate, setSelectedDate] = useState<Date>(() => localDayRange(now).start)
  const [trendCategory, setTrendCategory] = useState<CategoryId | 'all'>('all')

  const windowStart = granularity === 'day' ? selectedDate : startOfWeek(selectedDate)
  const windowLength = granularity === 'day' ? 1 : 7

  // One extra LEADING day so a midnight-crossing activity from just before
  // the reported window is still attributed to the right calendar day
  // (rule 2) — see `bucketByCalendarDay`'s own docstring. Sliced back off
  // below; never rendered.
  const fetchDays = useMemo(
    () => Array.from({ length: windowLength + 1 }, (_, i) => addDays(windowStart, i - 1)),
    [windowStart.getTime(), windowLength],
  )
  const totals = useInsightsDays(fetchDays)
  const view = classifyInsightsView(totals.days, categoryIdOf, {
    syncing: totals.syncing,
    syncFailed: totals.syncFailed,
    retry: totals.retry,
  })

  const todayMidnight = localDayRange(now).start
  const trendSpan = granularity === 'day' ? DAY_TREND_LENGTH : WEEK_TREND_LENGTH
  const trendEnd = granularity === 'week' ? addDays(startOfWeek(todayMidnight), 7) : addDays(todayMidnight, 1)
  const trendStart = addDays(trendEnd, -trendSpan)
  const trendFetchDays = useMemo(
    () => Array.from({ length: trendSpan + 1 }, (_, i) => addDays(trendStart, i - 1)),
    [trendStart.getTime(), trendSpan],
  )
  const trendTotals = useInsightsDays(trendFetchDays)
  const trendView = classifyInsightsView(trendTotals.days, categoryIdOf, {
    syncing: trendTotals.syncing,
    syncFailed: trendTotals.syncFailed,
    retry: trendTotals.retry,
  })

  return (
    <div className="flex flex-col pb-5xl">
      <header className="flex min-h-header flex-wrap items-center justify-between gap-lg mobile:gap-md">
        <h1 className="pl-0 font-display text-h1 font-semibold text-forest mobile:pl-[52px] mobile:text-h1-sm">
          Insights
        </h1>
        <div className="flex flex-wrap items-center justify-end gap-sm">
          <GranularityToggle value={granularity} onChange={setGranularity} />
          <DateRangeNav
            granularity={granularity}
            selectedDate={selectedDate}
            now={now}
            onSelect={setSelectedDate}
          />
        </div>
      </header>

      <div className="mt-xl ipad-land:mt-md">
        {view.kind === 'loading' && <StateMessage icon={Loader2} spin label="Loading your activity history…" />}

        {view.kind === 'error' && (
          <StateMessage icon={AlertTriangle} label="Couldn't load your activity history right now.">
            <Button variant="ghost" onClick={view.retry} className="mt-md">
              Try again
            </Button>
          </StateMessage>
        )}

        {view.kind === 'empty' && (
          <StateMessage
            icon={Sparkles}
            label={granularity === 'day' ? 'Nothing scheduled on this day yet.' : 'Nothing scheduled this week yet.'}
          >
            <p className="mt-xs text-caption text-muted">
              Schedule something on the Today page and it will show up here.
            </p>
          </StateMessage>
        )}

        {view.kind === 'ready' && (
          <ReadyInsights
            days={view.days.slice(1)}
            trendDays={trendView.kind === 'ready' ? trendView.days.slice(1) : []}
            granularity={granularity}
            trendCategory={trendCategory}
            onTrendCategoryChange={setTrendCategory}
          />
        )}
      </div>
    </div>
  )
}

function ReadyInsights({
  days,
  trendDays,
  granularity,
  trendCategory,
  onTrendCategoryChange,
}: {
  days: DayTotals[]
  trendDays: DayTotals[]
  granularity: Granularity
  trendCategory: CategoryId | 'all'
  onTrendCategoryChange: (id: CategoryId | 'all') => void
}) {
  const range = sumDayTotals(days)

  const trendPoints: TrendPoint[] = useMemo(() => {
    if (granularity === 'day') {
      return trendDays.map((day) => ({
        key: localDateISO(day.date),
        label: day.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        fullLabel: day.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
        minutes: trendCategory === 'all' ? day.occupiedMinutes : day.minutesByCategory[trendCategory],
      }))
    }
    return bucketByCalendarWeek(trendDays).map((week) => ({
      key: localDateISO(week.weekStart),
      label: week.weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      fullLabel: `Week of ${week.weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
      minutes: trendCategory === 'all' ? week.occupiedMinutes : week.minutesByCategory[trendCategory],
    }))
  }, [trendDays, granularity, trendCategory])

  return (
    <div className="flex flex-col gap-xl">
      <div className="grid grid-cols-2 gap-xl mobile:grid-cols-1 ipad-land:gap-lg">
        <InsightsCard
          title="Time by category"
          subtitle={granularity === 'day' ? 'Today’s totals, by category' : 'This week’s totals, by category'}
        >
          <CategoryTotalsChart minutesByCategory={range.minutesByCategory} />
        </InsightsCard>

        <InsightsCard title="Free vs. occupied" subtitle="Scheduled time against the whole window">
          <Meter
            label={granularity === 'day' ? 'Occupied today' : 'Occupied this week'}
            value={range.occupiedMinutes}
            max={range.totalMinutes}
            valueLabel={`${formatDurationMinutes(range.occupiedMinutes)} occupied · ${formatDurationMinutes(range.freeMinutes)} free of ${formatDurationMinutes(range.totalMinutes)}`}
          />
        </InsightsCard>
      </div>

      <InsightsCard title="Completion" subtitle="Of what was scheduled, how much got marked done">
        <CompletionSection completion={range.completion} completionByCategory={range.completionByCategory} />
      </InsightsCard>

      <InsightsCard
        title="Trend"
        subtitle={
          granularity === 'day'
            ? `The last ${DAY_TREND_LENGTH} days`
            : `The last ${WEEK_TREND_LENGTH / 7} weeks`
        }
      >
        <TrendCategoryFilter value={trendCategory} onChange={onTrendCategoryChange} />
        {trendPoints.every((point) => point.minutes === 0) ? (
          <p className="mt-lg text-caption text-muted">
            Nothing scheduled for {trendCategory === 'all' ? 'this period' : CATEGORIES[trendCategory].label.toLowerCase()} yet.
          </p>
        ) : (
          <div className="mt-lg">
            <TrendChart points={trendPoints} color={trendCategory === 'all' ? undefined : CATEGORIES[trendCategory].deep} />
          </div>
        )}
      </InsightsCard>
    </div>
  )
}

function InsightsCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-white p-xl shadow-elevation-1 mobile:p-lg">
      <div className="mb-lg">
        <h2 className="text-body font-bold text-charcoal">{title}</h2>
        {subtitle && <p className="mt-xs text-caption text-muted">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

function StateMessage({
  icon: Icon,
  label,
  spin,
  children,
}: {
  icon: typeof Loader2
  label: string
  spin?: boolean
  children?: ReactNode
}) {
  return (
    <div
      role={spin ? 'status' : undefined}
      aria-live={spin ? 'polite' : undefined}
      className="flex flex-col items-center gap-md rounded-lg border border-line bg-white px-xl py-5xl text-center shadow-elevation-1"
    >
      <Icon aria-hidden="true" className={cn('size-[28px] text-muted', spin && 'animate-spin')} />
      <p className="text-body font-semibold text-charcoal">{label}</p>
      {children}
    </div>
  )
}

function GranularityToggle({ value, onChange }: { value: Granularity; onChange: (g: Granularity) => void }) {
  return (
    <div role="tablist" aria-label="Totals granularity" className="flex items-center gap-xs rounded-full border border-line bg-bg p-xs">
      {(['day', 'week'] as const).map((g) => (
        <button
          key={g}
          type="button"
          role="tab"
          aria-selected={value === g}
          onClick={() => onChange(g)}
          className={chipVariants({ tone: value === g ? 'active' : 'bare', size: 'segment', interactive: true })}
        >
          {g === 'day' ? 'Day' : 'Week'}
        </button>
      ))}
    </div>
  )
}

function TrendCategoryFilter({
  value,
  onChange,
}: {
  value: CategoryId | 'all'
  onChange: (id: CategoryId | 'all') => void
}) {
  return (
    <div role="group" aria-label="Filter trend by category" className="flex flex-wrap gap-xs">
      <button
        type="button"
        aria-pressed={value === 'all'}
        onClick={() => onChange('all')}
        className={chipVariants({ tone: value === 'all' ? 'active' : 'surface', size: 'sm', interactive: true })}
      >
        All
      </button>
      {CATEGORY_ORDER.map((id) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className={chipVariants({ tone: value === id ? 'active' : 'surface', size: 'sm', interactive: true })}
        >
          {CATEGORIES[id].label}
        </button>
      ))}
    </div>
  )
}

function formatDayLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatWeekLabel(weekStart: Date): string {
  const end = addDays(weekStart, 6)
  const startLabel = weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const endLabel = end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${startLabel} – ${endLabel}`
}

function DateRangeNav({
  granularity,
  selectedDate,
  now,
  onSelect,
}: {
  granularity: Granularity
  selectedDate: Date
  now: Date
  onSelect: (date: Date) => void
}) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const label = granularity === 'day' ? formatDayLabel(selectedDate) : formatWeekLabel(startOfWeek(selectedDate))
  const step = (delta: number) => onSelect(addDays(selectedDate, granularity === 'day' ? delta : delta * 7))

  const navButton =
    'flex size-stepper items-center justify-center rounded-full text-forest transition-colors hover:bg-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest'

  return (
    <div className="flex items-center gap-xs">
      <button type="button" aria-label="Previous" onClick={() => step(-1)} className={navButton}>
        <ChevronLeft aria-hidden="true" className="size-[16px]" />
      </button>

      <div ref={panelRef} className="relative">
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`Change viewed ${granularity} — currently ${label}`}
          onClick={() => setOpen((v) => !v)}
          className={cn(chipVariants({ tone: 'surface', size: 'sm', interactive: true }), 'font-semibold')}
        >
          <CalendarDays aria-hidden="true" className="size-[14px] text-muted" />
          {label}
        </button>
        {open && (
          <DatePicker
            viewedDate={selectedDate}
            today={now}
            onSelect={(date) => {
              onSelect(date)
              setOpen(false)
              triggerRef.current?.focus()
            }}
            onClose={() => {
              setOpen(false)
              triggerRef.current?.focus()
            }}
          />
        )}
      </div>

      <button type="button" aria-label="Next" onClick={() => step(1)} className={navButton}>
        <ChevronRight aria-hidden="true" className="size-[16px]" />
      </button>
    </div>
  )
}
