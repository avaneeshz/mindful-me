import { useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { CheckCircle2, Circle, Info } from 'lucide-react'
import { CATEGORIES, CATEGORY_ORDER, cardsForCategory } from '@/data/activities'
import { isCardLocked, tileProgress, isTileLocked, type TileProgress } from '@/domain/disappear'
import { computePanelGeometry, type PanelGeometry } from '@/domain/panelGeometry'
import type { ActivityCard, ActivityList, Category, CategoryId } from '@/domain/types'
import { cn } from '@/lib/utils'

/** e.g. "1 activity totalling 30 minutes", "2 activities totalling 30 minutes". */
export function describeSlotContents(activityCount: number, usedMinutes: number): string {
  const activities = `${activityCount} ${activityCount === 1 ? 'activity' : 'activities'}`
  const minutes = `${usedMinutes} ${usedMinutes === 1 ? 'minute' : 'minutes'}`
  return `${activities} totalling ${minutes}`
}

/** e.g. "3 of 5 done" */
function describeProgress(progress: TileProgress): string {
  return `${progress.done} of ${progress.total} done`
}

interface TileRowProps {
  /** True when the slot can take nothing further and nothing is staged. */
  atCapacity: boolean
  activityCount: number
  usedMinutes: number
  /** Today's (viewed day's) full activity list — what `auto:N` disappear rules count against. */
  activities: ActivityList
  /** Item names the user has manually marked done today (Tile Redesign §5). */
  dismissed: ReadonlySet<string>
  onPickCard: (cardName: string) => void
  onToggleDismiss: (cardName: string) => void
}

/**
 * Tile row (Modal Redesign §1, then Section B of the theme/panel round) —
 * the 9 tiles as one fill-width horizontal row (never a 3x3 grid, never
 * scrolling). Tapping a tile grows a panel directly below the row, IN REAL
 * LAYOUT FLOW (`.panel-outer`'s `grid-template-rows` animation, styles/
 * index.css) — never `position: absolute` — which is what guarantees it can
 * never overlap anything: the container genuinely grows to contain it. The
 * panel anchors to the tapped tile (left edge for tiles 1-4, centered under
 * tile 5, right edge for tiles 6-9), sizes itself to exactly fit that
 * category's own item count, and grows a chevron + scale-in animation
 * anchored at the tapped tile's own x position — see `domain/panelGeometry.ts`
 * for the actual placement math (measured pixel rects in, geometry out; that
 * module is where this behaviour is actually unit-tested, the same way real
 * pointer-drag math is tested at the pure-function layer elsewhere in this
 * app, not through simulated DOM events this SSR-string test suite can't
 * produce). Tapping the same tile again collapses the panel; tapping a
 * different tile swaps the panel's content and re-anchors in place.
 */
export function TileRow({
  atCapacity,
  activityCount,
  usedMinutes,
  activities,
  dismissed,
  onPickCard,
  onToggleDismiss,
}: TileRowProps) {
  const [draggingCard, setDraggingCard] = useState<string | null>(null)
  const [openCategory, setOpenCategory] = useState<CategoryId | null>(null)
  const [geometry, setGeometry] = useState<PanelGeometry | null>(null)
  const rowRef = useRef<HTMLDivElement>(null)

  const openCards = openCategory ? cardsForCategory(openCategory) : null
  const openProgress = openCards ? tileProgress(openCards, activities, dismissed) : null
  const openCategoryDef = openCategory ? CATEGORIES[openCategory] : null

  function toggleTile(categoryId: CategoryId, tileIndex: number, event: ReactMouseEvent<HTMLButtonElement>) {
    if (openCategory === categoryId) {
      setOpenCategory(null)
      setGeometry(null)
      return
    }
    const rowEl = rowRef.current
    const tileEl = event.currentTarget
    if (rowEl) {
      const rowRect = rowEl.getBoundingClientRect()
      const tileRect = tileEl.getBoundingClientRect()
      setGeometry(
        computePanelGeometry({
          tileIndex,
          tileCount: CATEGORY_ORDER.length,
          tileLeft: tileRect.left - rowRect.left,
          tileWidth: tileRect.width,
          rowWidth: rowRect.width,
          itemCount: cardsForCategory(categoryId).length,
        }),
      )
    }
    setOpenCategory(categoryId)
  }

  return (
    <div>
      {/*
        `role="status"` matches the capacity message that used to sit above
        the flat picker grid. The reason has to be ANNOUNCED, not merely
        present on screen — assistive tech can't otherwise tell why the row
        below just went `aria-hidden`.
      */}
      {atCapacity && (
        <p
          role="status"
          className="mb-lg flex items-start gap-sm rounded-md bg-bg px-md py-sm text-note font-medium text-ink"
        >
          <Info aria-hidden="true" className="mt-px size-[14px] shrink-0 text-ink-dim" />
          <span>
            This slot is full — {describeSlotContents(activityCount, usedMinutes)}.{' '}
            <span className="sr-only">The activity list above is unavailable until there is room. </span>
            {activityCount === 1 ? 'Remove it' : 'Remove one'} above to free up space, or choose a
            different slot.
          </span>
        </p>
      )}

      <div ref={rowRef} className={cn('tile-row', atCapacity && 'opacity-40')}>
        {CATEGORY_ORDER.map((categoryId, tileIndex) => {
          const category = CATEGORIES[categoryId]
          const progress = tileProgress(cardsForCategory(categoryId), activities, dismissed)
          const isActive = openCategory === categoryId
          return (
            <Tile
              key={categoryId}
              category={category}
              progress={progress}
              isActive={isActive}
              hiddenFromAT={atCapacity}
              onToggle={(event) => toggleTile(categoryId, tileIndex, event)}
            />
          )
        })}
      </div>

      {/* Real layout flow — see the doc comment above and `.panel-outer` in
          index.css. Always mounted (never conditionally rendered) so the
          grid-rows transition has something to animate; `.show` and the
          geometry inline styles are what actually open/position it. */}
      <div className={cn('panel-outer', openCategory && geometry && 'show')}>
        <div className="panel-inner">
          {openCategory && openCards && openProgress && openCategoryDef && geometry && (
            <div
              className="activity-panel mt-md rounded-lg border border-line bg-surface p-lg"
              style={
                {
                  width: `${geometry.width}px`,
                  marginLeft: `${geometry.marginLeft}px`,
                  '--origin-x': `${geometry.chevronLeft}px`,
                } as CSSProperties
              }
            >
              <span
                aria-hidden="true"
                className="absolute -top-[7px] size-0 border-x-[7px] border-b-[7px] border-x-transparent border-b-surface"
                style={{ left: `${geometry.chevronLeft}px` }}
              />
              <PanelHeader category={openCategoryDef} progress={openProgress} />
              <div className={cn('item-chip-row mt-md', atCapacity && 'opacity-40')}>
                {openCards.map((card) => (
                  <ItemChip
                    key={card.name}
                    card={card}
                    locked={isCardLocked(card, activities, dismissed)}
                    atCapacity={atCapacity}
                    isDragging={draggingCard === card.name}
                    onPick={() => onPickCard(card.name)}
                    onToggleDismiss={() => onToggleDismiss(card.name)}
                    onDragStart={() => setDraggingCard(card.name)}
                    onDragEnd={() => setDraggingCard(null)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PanelHeader({ category, progress }: { category: Category; progress: TileProgress }) {
  const Icon = category.icon
  return (
    <div className="flex items-center gap-sm">
      {/* The connector — repeats the active tile's own icon, so the panel
          unambiguously belongs to it even once the row has scrolled the
          tile itself out of easy reach. */}
      <span
        aria-hidden="true"
        className="flex size-[28px] shrink-0 items-center justify-center rounded-full bg-inv-bg text-inv-ink"
      >
        <Icon className="size-[15px]" />
      </span>
      <h3 className="text-meta font-semibold text-ink">{category.label}</h3>
      {progress.done > 0 && (
        <p role="status" className="text-note font-medium text-ink-dim">
          {describeProgress(progress)} for today.
        </p>
      )}
    </div>
  )
}

function Tile({
  category,
  progress,
  isActive,
  hiddenFromAT,
  onToggle,
}: {
  category: Category
  progress: TileProgress
  isActive: boolean
  hiddenFromAT: boolean
  onToggle: (event: ReactMouseEvent<HTMLButtonElement>) => void
}) {
  const Icon = category.icon
  const locked = isTileLocked(progress)
  // A real proportional gauge — done/total, not a fixed decorative value.
  const fillPct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div className="relative flex-1 min-w-0">
      <button
        type="button"
        tabIndex={hiddenFromAT ? -1 : undefined}
        aria-hidden={hiddenFromAT || undefined}
        aria-pressed={isActive}
        onClick={onToggle}
        aria-label={`${category.label}, ${describeProgress(progress)}`}
        className={cn(
          'relative flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-sm overflow-hidden',
          'rounded-lg border bg-bg p-sm transition-colors',
          'hover:border-ink',
          // Active: an ink ring, exactly the same treatment a selected chip
          // uses elsewhere — no colour swap, no separate accent hue.
          isActive ? 'border-ink shadow-[0_0_0_1px_var(--ink)]' : 'border-line',
        )}
      >
        <Icon aria-hidden="true" className="size-[20px] shrink-0 text-ink" />
        <span
          aria-hidden="true"
          className="w-full line-clamp-2 px-xs text-center text-micro font-bold leading-tight text-ink"
        >
          {category.label}
        </span>

        {/* Section B — a flat progress bar (fill width = done/total)
            replaces the old water-fill gauge. Always rendered, even at 0%,
            matching the reference implementation's own track/fill pair. */}
        <span aria-hidden="true" className="h-[4px] w-full overflow-hidden rounded-full bg-line">
          <span className="block h-full rounded-full bg-ink" style={{ width: `${fillPct}%` }} />
        </span>

        {locked && (
          <span
            aria-hidden="true"
            className="absolute left-xs top-xs flex size-[16px] items-center justify-center rounded-full bg-surface text-ink"
          >
            <CheckCircle2 className="size-[13px]" strokeWidth={2.5} />
          </span>
        )}
      </button>
    </div>
  )
}

function ItemChip({
  card,
  locked,
  atCapacity,
  isDragging,
  onPick,
  onToggleDismiss,
  onDragStart,
  onDragEnd,
}: {
  card: ActivityCard
  locked: boolean
  atCapacity: boolean
  isDragging: boolean
  onPick: () => void
  onToggleDismiss: () => void
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const Icon = card.icon
  const hiddenFromAT = locked || atCapacity

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        draggable={!locked}
        disabled={locked}
        tabIndex={hiddenFromAT ? -1 : undefined}
        aria-hidden={hiddenFromAT || undefined}
        onClick={onPick}
        onDragStart={(event) => {
          event.dataTransfer.setData('text/plain', card.name)
          event.dataTransfer.effectAllowed = 'copy'
          onDragStart()
        }}
        onDragEnd={onDragEnd}
        aria-label={card.sub ? `${card.name}, ${card.sub.length} options` : card.name}
        className={cn(
          'relative flex aspect-square w-[92px] shrink-0 cursor-grab flex-col items-center justify-center gap-xs',
          'rounded-lg border border-line bg-bg p-xs transition-colors',
          'hover:border-ink active:cursor-grabbing disabled:cursor-not-allowed',
          isDragging && 'scale-[0.96] opacity-40',
          // No per-item colour any more (Section A) — a locked item dims via
          // opacity alone, same as everywhere else "done" reads without a
          // colour swap.
          locked && 'opacity-40',
        )}
      >
        <Icon aria-hidden="true" className="size-[20px] shrink-0 text-ink" />
        <span aria-hidden="true" className="w-full truncate px-px text-center text-micro font-semibold text-ink">
          {card.name}
        </span>

        {card.sub && (
          <span
            aria-hidden="true"
            className="absolute right-xs top-xs flex size-[18px] items-center justify-center rounded-full bg-surface text-nano font-extrabold text-ink"
          >
            {card.sub.length}
          </span>
        )}

        {locked && (
          <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center rounded-lg bg-surface/60">
            <CheckCircle2 className="size-[24px] text-ink" strokeWidth={2.25} />
          </span>
        )}
      </button>

      {!locked && card.disappear.mode === 'manual' && (
        <button
          type="button"
          tabIndex={atCapacity ? -1 : undefined}
          aria-hidden={atCapacity || undefined}
          onClick={(event) => {
            event.stopPropagation()
            onToggleDismiss()
          }}
          aria-label={`Mark ${card.name} done for today`}
          className="absolute left-xs top-xs flex size-[18px] items-center justify-center rounded-full bg-surface text-ink-dim transition-colors hover:text-ink"
        >
          <Circle aria-hidden="true" className="size-[12px]" strokeWidth={2.5} />
        </button>
      )}
    </div>
  )
}
