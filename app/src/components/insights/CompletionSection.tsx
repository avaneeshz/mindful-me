import { CATEGORIES } from '@/data/activities'
import { CATEGORY_ORDER, type CompletionStats } from '@/domain/insights'
import type { CategoryId } from '@/domain/types'
import { Meter } from '@/components/ui/meter'
import { CategoryIconChip } from '@/components/editor/CategoryIconChip'

/**
 * "Planned vs. actual" — honestly scoped to what the data actually supports
 * (no separate actual-duration field exists yet, so this is completion
 * tracking: of what was scheduled, how much got marked done). An overall
 * Meter plus a per-category breakdown, in the same fixed category order used
 * everywhere else on this screen.
 */
export function CompletionSection({
  completion,
  completionByCategory,
}: {
  completion: CompletionStats
  completionByCategory: Record<CategoryId, CompletionStats>
}) {
  const rows = CATEGORY_ORDER.filter((id) => completionByCategory[id].totalCount > 0)

  return (
    <div className="flex flex-col gap-xl">
      <Meter
        label="Completed"
        value={completion.completedCount}
        max={completion.totalCount}
        valueLabel={`${completion.completedCount} of ${completion.totalCount} completed (${Math.round(completion.completionRate * 100)}%)`}
      />

      {rows.length > 0 && (
        <ul className="flex flex-col gap-sm">
          {rows.map((id) => (
            <CategoryCompletionRow key={id} id={id} stats={completionByCategory[id]} />
          ))}
        </ul>
      )}
    </div>
  )
}

function CategoryCompletionRow({ id, stats }: { id: CategoryId; stats: CompletionStats }) {
  const category = CATEGORIES[id]
  const pct = stats.totalCount === 0 ? 0 : Math.round((stats.completedCount / stats.totalCount) * 100)

  return (
    <li className="flex min-h-row items-center gap-md rounded-md bg-bg px-md py-sm">
      <CategoryIconChip category={category} icon={category.icon} />
      <span className="min-w-0 flex-1 truncate text-body font-semibold text-charcoal">{category.label}</span>
      <div
        role="progressbar"
        aria-label={`${category.label} completed`}
        aria-valuemin={0}
        aria-valuemax={stats.totalCount}
        aria-valuenow={stats.completedCount}
        className="h-meter w-[88px] shrink-0 overflow-hidden rounded-full bg-white mobile:hidden"
      >
        <span className="block h-full rounded-full bg-forest" style={{ width: `${pct}%` }} />
      </div>
      <span className="shrink-0 whitespace-nowrap text-caption font-medium text-muted">
        {stats.completedCount}/{stats.totalCount} · {pct}%
      </span>
    </li>
  )
}
