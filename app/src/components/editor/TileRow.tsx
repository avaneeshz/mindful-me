import { useState, type CSSProperties } from 'react'
import { CheckCircle2, Circle, Info } from 'lucide-react'
import { CATEGORIES, CATEGORY_ORDER, cardsForCategory } from '@/data/activities'
import { isCardLocked, tileProgress, isTileLocked, type TileProgress } from '@/domain/disappear'
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
 * Tile row (Modal Redesign §1) — the 9 tiles as ONE horizontal scrollable
 * row (never a 3x3 grid; PR #9's grid is retired). Tapping a tile does NOT
 * replace the screen — it expands a panel directly below the row showing
 * that tile's 5-7 items as chips, and the row stays put underneath. Tapping
 * the same tile again collapses the panel; tapping a different tile swaps
 * the panel's content in place.
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

  const openCards = openCategory ? cardsForCategory(openCategory) : null
  const openProgress = openCards ? tileProgress(openCards, activities, dismissed) : null
  const openCategoryDef = openCategory ? CATEGORIES[openCategory] : null

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
          className="mb-lg flex items-start gap-sm rounded-md bg-bg px-md py-sm text-note font-medium text-charcoal"
        >
          <Info aria-hidden="true" className="mt-px size-[14px] shrink-0 text-muted" />
          <span>
            This slot is full — {describeSlotContents(activityCount, usedMinutes)}.{' '}
            <span className="sr-only">The activity list above is unavailable until there is room. </span>
            {activityCount === 1 ? 'Remove it' : 'Remove one'} above to free up space, or choose a
            different slot.
          </span>
        </p>
      )}

      <div className={cn('tile-row', atCapacity && 'opacity-40')}>
        {CATEGORY_ORDER.map((categoryId) => {
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
              onToggle={() => setOpenCategory(isActive ? null : categoryId)}
            />
          )
        })}
      </div>

      {openCategory && openCards && openProgress && openCategoryDef && (
        <div className="mt-md rounded-lg border border-line bg-bg p-md">
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
  )
}

function PanelHeader({ category, progress }: { category: Category; progress: TileProgress }) {
  const Icon = category.icon
  return (
    <div className="flex items-center gap-sm">
      {/* The connector — repeats the active tile's own icon + accent colour,
          so the panel unambiguously belongs to it even once the row has
          scrolled the tile itself out of easy reach. */}
      <span
        aria-hidden="true"
        className="flex size-[28px] shrink-0 items-center justify-center rounded-full text-white"
        style={{ background: category.deep }}
      >
        <Icon className="size-[15px]" />
      </span>
      <h3 className="text-meta font-semibold text-forest">{category.label}</h3>
      {progress.done > 0 && (
        <p role="status" className="text-note font-medium text-muted">
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
  onToggle: () => void
}) {
  const Icon = category.icon
  const locked = isTileLocked(progress)

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        tabIndex={hiddenFromAT ? -1 : undefined}
        aria-hidden={hiddenFromAT || undefined}
        aria-pressed={isActive}
        onClick={onToggle}
        aria-label={`${category.label}, ${describeProgress(progress)}`}
        className={cn(
          'relative flex aspect-square w-[104px] shrink-0 cursor-pointer flex-col items-center justify-end gap-xs overflow-hidden',
          'rounded-lg p-sm transition-shadow',
          'hover:shadow-elevation-2',
          // Active state: the tile's OWN accent as a ring + a subtle lift —
          // never a full colour swap, keeping the row calm (CLAUDE.md).
          isActive ? 'shadow-elevation-2 ring-2 ring-offset-2' : 'ring-0',
          locked && 'saturate-[0.35] opacity-80',
        )}
        style={{
          background: category.deep,
          // The ring colour tracks the tile's own accent — inline since it's
          // a per-tile design token, not a fixed Tailwind color.
          ...(isActive ? ({ '--tw-ring-color': category.deep } as CSSProperties) : {}),
        }}
      >
        {/* Subtle wave motif — the same visual language TimelineScenery
            already uses elsewhere, kept purely decorative and low-contrast
            so it never fights the icon/label sitting on top of it. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 104 40"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[40%] w-full opacity-25"
        >
          <path d="M0 20 Q 13 8 26 20 T 52 20 T 78 20 T 104 20 V40 H0 Z" fill="white" />
        </svg>

        <Icon aria-hidden="true" className={cn('relative z-[1] size-[20px] shrink-0', category.onDeep)} />
        <span
          aria-hidden="true"
          className={cn(
            'relative z-[1] line-clamp-2 w-full px-xs text-center text-micro font-semibold leading-tight',
            category.onDeep,
            category.onDeepBoost,
          )}
        >
          {category.label}
        </span>

        {/* Done-count, pinned to the tile's own bottom edge. */}
        <span
          aria-hidden="true"
          className="relative z-[1] rounded-full bg-white/90 px-sm py-px text-nano font-extrabold text-charcoal"
        >
          {progress.done}/{progress.total}
        </span>

        {locked && (
          <span
            aria-hidden="true"
            className="absolute left-xs top-xs z-[1] flex size-[16px] items-center justify-center rounded-full bg-white/90 text-forest"
          >
            <CheckCircle2 className="size-[13px]" strokeWidth={2.5} />
          </span>
        )}
      </button>

      {/* The chevron connector — sits on the tile itself so it scrolls WITH
          it, rather than trying to track scroll position on a separately
          positioned element. */}
      {isActive && (
        <span
          aria-hidden="true"
          className="absolute -bottom-[9px] left-1/2 size-0 -translate-x-1/2 border-x-[7px] border-t-[8px] border-x-transparent"
          style={{ borderTopColor: category.deep }}
        />
      )}
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
          'rounded-lg p-xs transition-shadow',
          'hover:shadow-elevation-2 active:cursor-grabbing disabled:cursor-not-allowed',
          card.hairline && 'ring-1 ring-inset ring-line',
          isDragging && 'scale-[0.96] opacity-40',
          locked && 'saturate-[0.3] opacity-70',
        )}
        style={{ background: card.color }}
      >
        <Icon aria-hidden="true" className={cn('size-[20px] shrink-0', card.onColor)} />
        <span
          aria-hidden="true"
          className={cn('w-full truncate px-px text-center text-micro font-semibold', card.onColor, card.onColorBoost)}
        >
          {card.name}
        </span>

        {card.sub && (
          <span
            aria-hidden="true"
            className="absolute right-xs top-xs flex size-[18px] items-center justify-center rounded-full bg-white/90 text-nano font-extrabold text-charcoal"
          >
            {card.sub.length}
          </span>
        )}

        {locked && (
          <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/50">
            <CheckCircle2 className="size-[24px] text-forest" strokeWidth={2.25} />
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
          className="absolute left-xs top-xs flex size-[18px] items-center justify-center rounded-full bg-white/90 text-muted transition-colors hover:text-forest"
        >
          <Circle aria-hidden="true" className="size-[12px]" strokeWidth={2.5} />
        </button>
      )}
    </div>
  )
}
