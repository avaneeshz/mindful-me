import { useState } from 'react'
import { CheckCircle2, Circle, Info, X } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
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
 * Tile row (Modal Redesign §1, then Section B of the theme/panel round,
 * then the popup round) — the 9 tiles as one fill-width horizontal row
 * (never a 3x3 grid, never scrolling). Tapping a tile opens that category's
 * items in a popup dialog (the same Radix Dialog pattern `LogActivityModal`
 * uses — deliberately no `<Dialog.Portal>`, see the comment above its
 * `Dialog.Root` for why), reusing `ItemChip`'s grid content and
 * `PanelHeader`'s icon/label/progress as the dialog's own header. Picking a
 * card inside it calls `onPickCard` and closes the dialog, so
 * `LogActivityModal` opens on top exactly as it does today — that modal is
 * driven entirely by `staging.cardName`, unrelated to this dialog's own open
 * state. Tapping the same tile again, or the dialog's own close affordance
 * (X button, Escape, overlay click), closes it; tapping a different tile
 * swaps the dialog's contents in place.
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

  function toggleTile(categoryId: CategoryId) {
    setOpenCategory((current) => (current === categoryId ? null : categoryId))
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
              onToggle={() => toggleTile(categoryId)}
            />
          )
        })}
      </div>

      {/* The popup — see the doc comment above. Deliberately no
          `<Dialog.Portal>`: this whole app's test suite is SSR-string
          assertions (`renderToStaticMarkup`), and a portal's content renders
          into a real DOM node that plain server rendering never produces —
          it would silently vanish from every test despite `open` being
          true. `position: fixed` still positions against the viewport
          either way. */}
      <Dialog.Root open={openCategory !== null} onOpenChange={(open) => !open && setOpenCategory(null)}>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/45" />
        <Dialog.Content
          className={cn(
            'fixed z-50 flex flex-col gap-md overflow-y-auto bg-surface p-lg shadow-elevation-2 focus:outline-none',
            'inset-0 mobile:inset-0',
            'md:inset-auto md:left-1/2 md:top-1/2 md:w-[min(640px,92vw)] md:max-h-[85vh] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg',
          )}
        >
          {openCategory && openCards && openProgress && openCategoryDef && (
            <>
              <div className="flex items-start justify-between gap-md">
                <PanelHeader category={openCategoryDef} progress={openProgress} />
                <Dialog.Close asChild>
                  <button
                    type="button"
                    aria-label="Close"
                    className="flex size-[32px] shrink-0 items-center justify-center rounded-full text-ink-dim transition-colors hover:bg-bg hover:text-ink"
                  >
                    <X aria-hidden="true" className="size-[18px]" />
                  </button>
                </Dialog.Close>
              </div>
              <Dialog.Description className="sr-only">
                Choose an item from {openCategoryDef.label} to log for today.
              </Dialog.Description>
              <div className={cn('item-chip-row', atCapacity && 'opacity-40')}>
                {openCards.map((card) => (
                  <ItemChip
                    key={card.name}
                    card={card}
                    locked={isCardLocked(card, activities, dismissed)}
                    atCapacity={atCapacity}
                    isDragging={draggingCard === card.name}
                    onPick={() => {
                      onPickCard(card.name)
                      setOpenCategory(null)
                    }}
                    onToggleDismiss={() => onToggleDismiss(card.name)}
                    onDragStart={() => setDraggingCard(card.name)}
                    onDragEnd={() => setDraggingCard(null)}
                  />
                ))}
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Root>
    </div>
  )
}

function PanelHeader({ category, progress }: { category: Category; progress: TileProgress }) {
  const Icon = category.icon
  return (
    <div className="flex items-center gap-sm">
      {/* The connector — repeats the active tile's own icon, so the dialog
          unambiguously belongs to it. */}
      <span
        aria-hidden="true"
        className="flex size-[28px] shrink-0 items-center justify-center rounded-full bg-inv-bg text-inv-ink"
      >
        <Icon className="size-[15px]" />
      </span>
      {/* `asChild` hands the heading element itself to Radix so the dialog
          gets a real `aria-labelledby`-linked accessible name, same visual
          markup as before. */}
      <Dialog.Title asChild>
        <h3 className="text-meta font-semibold text-ink">{category.label}</h3>
      </Dialog.Title>
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
  onToggle: () => void
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
