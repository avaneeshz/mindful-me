import { useState } from 'react'
import { CheckCircle2, ChevronLeft, Circle, Info } from 'lucide-react'
import { CATEGORIES, CATEGORY_ORDER, cardsForCategory } from '@/data/activities'
import { isCardLocked, tileProgress, isTileLocked, type TileProgress } from '@/domain/disappear'
import type { ActivityCard, ActivityList, Category, CategoryId } from '@/domain/types'
import { stagingOptions, type StagingState } from '@/state/boardReducer'
import { Chip } from '@/components/ui/chip'
import { cn } from '@/lib/utils'

interface ActivityPickerProps {
  staging: StagingState
  /** True when the slot can take nothing further and nothing is staged. */
  atCapacity: boolean
  /** Live contents of the selected slot — the capacity notice is derived from
   *  these, never asserted. A slot reaches capacity at 2 activities OR at 30
   *  booked minutes, so a single 30-minute entry fills it just as a pair does. */
  activityCount: number
  usedMinutes: number
  /** Today's (viewed day's) full activity list — what `auto:N` disappear rules count against. */
  activities: ActivityList
  /** Item names the user has manually marked done today (Tile Redesign §5). */
  dismissed: ReadonlySet<string>
  onPickCard: (cardName: string) => void
  onPickOption: (level: number, value: string) => void
  onToggleDismiss: (cardName: string) => void
  onBack: () => void
}

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

export function ActivityPicker({
  staging,
  atCapacity,
  activityCount,
  usedMinutes,
  activities,
  dismissed,
  onPickCard,
  onPickOption,
  onToggleDismiss,
  onBack,
}: ActivityPickerProps) {
  const [draggingCard, setDraggingCard] = useState<string | null>(null)
  // Which of the 9 tiles is currently drilled into on the item-chip screen —
  // picker-local navigation, never staged/committed state (that stays
  // `staging.cardName`, unchanged, and clearing it — e.g. `crumbBack` at the
  // top level — falls back to whichever of these two screens was showing).
  // Deliberately NOT reset when `selectedSlot` changes: browsing a different
  // slot while a tile is open shouldn't discard that navigation context.
  const [openCategory, setOpenCategory] = useState<CategoryId | null>(null)
  const options = stagingOptions(staging)

  // --- Drilled into a card: breadcrumb + sub-option chips (unchanged) ---
  if (staging.cardName) {
    return (
      <div>
        <Breadcrumb cardName={staging.cardName} path={staging.path} onBack={onBack} />
        {options ? (
          <div className="mt-lg flex flex-wrap gap-sm">
            {options.options.map((option) => {
              const isSelected = staging.path[options.level] === option
              return (
                <Chip
                  key={option}
                  as="button"
                  size="md"
                  tone={isSelected ? 'active' : 'surface'}
                  interactive
                  aria-pressed={isSelected}
                  onClick={() => onPickOption(options.level, option)}
                >
                  {option}
                </Chip>
              )
            })}
          </div>
        ) : (
          <p className="mt-lg text-body font-medium text-muted">
            Selected. Set the duration and add it to the slot.
          </p>
        )}
      </div>
    )
  }

  const openCards = openCategory ? cardsForCategory(openCategory) : null
  const openProgress = openCards ? tileProgress(openCards, activities, dismissed) : null

  // --- Main screen (9 tiles) or one open tile's item chips ---
  //
  // `atCapacity` describes the CURRENTLY SELECTED slot only — it must never
  // hide the grid itself. Whichever of the two screens below is showing is
  // the drag source for every slot on the timeline, not just the selected
  // one, so a full selected slot only blocks the manual click-to-add path
  // (already enforced by the reducer, which no-ops `pickCard` once
  // `maxScheduleDuration` is 0) and dims/announces accordingly; it stays
  // mounted, visible and draggable so the user can still drag a card onto
  // any other, non-full slot.
  return (
    <div>
      {/*
        `role="status"` matches the capacity message in StagingPane. The
        reason has to be ANNOUNCED, not merely present on screen — assistive
        tech can't otherwise tell why the grid below just went `aria-hidden`.
        The final sentence names the activity list as the way out.
      */}
      {atCapacity && (
        // Keeps the grid on screen for context instead of replacing it with a
        // bare text block, which is what the prototype did.
        <p
          role="status"
          className="mb-lg flex items-start gap-sm rounded-md bg-bg px-md py-sm text-note font-medium text-charcoal"
        >
          <Info aria-hidden="true" className="mt-px size-[14px] shrink-0 text-muted" />
          <span>
            This slot is full — {describeSlotContents(activityCount, usedMinutes)}.{' '}
            {/*
              Sighted users can see the tile grid dimmed below, and can still
              drag a card from it onto a different, non-full slot. Assistive
              tech cannot reach it here — the grid is aria-hidden for THIS
              slot's click-to-add path — so that is stated here instead.
              Deliberately sr-only: the visible copy is approved wording and
              is not being redesigned in a bug-fix pass.
            */}
            <span className="sr-only">
              The activity list above is unavailable until there is room.{' '}
            </span>
            {activityCount === 1 ? 'Remove it' : 'Remove one'} above to free up space, or
            choose a different slot.
          </span>
        </p>
      )}

      {openCategory && openCards && openProgress ? (
        <div>
          <CategoryHeader
            category={CATEGORIES[openCategory]}
            progress={openProgress}
            onBack={() => setOpenCategory(null)}
          />
          <div className={cn('picker-grid mt-lg', atCapacity && 'opacity-40')}>
            {openCards.map((card) => (
              <ItemTile
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
      ) : (
        <div className={cn('picker-grid-main', atCapacity && 'opacity-40')}>
          {CATEGORY_ORDER.map((categoryId) => {
            const category = CATEGORIES[categoryId]
            const progress = tileProgress(cardsForCategory(categoryId), activities, dismissed)
            return (
              <MainTile
                key={categoryId}
                category={category}
                progress={progress}
                hiddenFromAT={atCapacity}
                onOpen={() => setOpenCategory(categoryId)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function CategoryHeader({
  category,
  progress,
  onBack,
}: {
  category: Category
  progress: TileProgress
  onBack: () => void
}) {
  const Icon = category.icon
  return (
    <div className="flex flex-col gap-sm">
      <nav aria-label="Activity selection" className="flex flex-wrap items-center gap-sm">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-xs text-meta font-bold text-gold hover:underline"
        >
          <ChevronLeft aria-hidden="true" className="size-[14px]" />
          back
        </button>
        <span aria-hidden="true" className="text-nano text-line">
          /
        </span>
        <span className="flex items-center gap-xs text-meta font-semibold text-forest">
          <Icon aria-hidden="true" className="size-[14px]" />
          {category.label}
        </span>
      </nav>
      {/* Only worth announcing once something in this tile is actually locked —
          mirrors the "This slot is full" notice's own conditionality above. */}
      {progress.done > 0 && (
        <p role="status" className="text-note font-medium text-muted">
          {describeProgress(progress)} for today.
        </p>
      )}
    </div>
  )
}

function MainTile({
  category,
  progress,
  hiddenFromAT,
  onOpen,
}: {
  category: Category
  progress: TileProgress
  hiddenFromAT: boolean
  onOpen: () => void
}) {
  const Icon = category.icon
  const locked = isTileLocked(progress)

  return (
    <button
      type="button"
      tabIndex={hiddenFromAT ? -1 : undefined}
      aria-hidden={hiddenFromAT || undefined}
      onClick={onOpen}
      aria-label={`${category.label}, ${describeProgress(progress)}`}
      className={cn(
        'relative flex aspect-square cursor-pointer flex-col items-center justify-center gap-xs',
        'rounded-lg p-xs transition-shadow',
        'hover:shadow-elevation-2',
        locked && 'saturate-[0.35] opacity-80',
      )}
      style={{ background: category.deep }}
    >
      <Icon aria-hidden="true" className={cn('size-[22px] shrink-0', category.onDeep)} />
      <span
        aria-hidden="true"
        className={cn(
          // Tile labels run 2-3 words long ("Movement & Body Therapy") — a
          // single-line `truncate` cut them off awkwardly mid-word, so this
          // wraps to 2 lines instead, which the tile's own fixed size easily
          // accommodates.
          'line-clamp-2 w-full px-xs text-center text-micro font-semibold leading-tight',
          category.onDeep,
          category.onDeepBoost,
        )}
      >
        {category.label}
      </span>

      {progress.total > 0 && (
        <span
          aria-hidden="true"
          className={cn(
            'absolute right-xs top-xs rounded-full bg-white/90 px-[5px] py-px text-nano font-extrabold text-charcoal',
          )}
        >
          {progress.done}/{progress.total}
        </span>
      )}

      {locked && (
        <span
          aria-hidden="true"
          className="absolute left-xs top-xs flex size-[16px] items-center justify-center rounded-full bg-white/90 text-forest"
        >
          <CheckCircle2 className="size-[13px]" strokeWidth={2.5} />
        </span>
      )}
    </button>
  )
}

function ItemTile({
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
  /** Done for today (auto threshold reached, or manually marked done) — genuinely non-interactive, not just dimmed. */
  locked: boolean
  /**
   * True while the currently SELECTED slot is full. Mirrors the original
   * flat grid's `hiddenFromAT`: the tile stays visible, draggable and
   * clickable (a click safely no-ops via the reducer) — only its presence in
   * the accessibility tree and tab order is withdrawn, matching the
   * "This slot is full" status message that explains why.
   */
  atCapacity: boolean
  isDragging: boolean
  onPick: () => void
  onToggleDismiss: () => void
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const Icon = card.icon
  // Locked has no reducer-level safety net the way a full slot does — this
  // is picker-only state the reducer knows nothing about — so it has to be a
  // REAL `disabled` (which also blocks dragging). `atCapacity` alone must
  // NEVER block dragging — see the prop doc above — so it only ever adds the
  // aria-hidden/tab-order withdrawal, exactly like the old flat grid.
  const hiddenFromAT = locked || atCapacity

  return (
    <div className="relative">
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
          'relative flex aspect-square w-full cursor-grab flex-col items-center justify-center gap-xs',
          'rounded-lg p-xs transition-shadow',
          'hover:shadow-elevation-2 active:cursor-grabbing disabled:cursor-not-allowed',
          card.hairline && 'ring-1 ring-inset ring-line',
          isDragging && 'scale-[0.96] opacity-40',
          locked && 'saturate-[0.3] opacity-70',
        )}
        style={{ background: card.color }}
      >
        <Icon aria-hidden="true" className={cn('size-[22px] shrink-0', card.onColor)} />
        <span
          aria-hidden="true"
          className={cn(
            'w-full truncate px-px text-center text-micro font-semibold',
            card.onColor,
            // Only set where the flat pairing misses WCAG AA — see index.css.
            card.onColorBoost,
          )}
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
          <span
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/50"
          >
            <CheckCircle2 className="size-[26px] text-forest" strokeWidth={2.25} />
          </span>
        )}
      </button>

      {/* The manual "mark done" control — a SIBLING of the pick button, never
          nested inside it (two interactive elements can't nest validly).
          Only shown for a `manual` item that isn't locked yet; once locked
          the checkmark badge above already says so, and un-marking mid-day
          isn't supported (rule: locks for the rest of the day). */}
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

function Breadcrumb({
  cardName,
  path,
  onBack,
}: {
  cardName: string
  path: string[]
  onBack: () => void
}) {
  return (
    <nav aria-label="Activity selection" className="flex flex-wrap items-center gap-sm">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-xs text-meta font-bold text-gold hover:underline"
      >
        <ChevronLeft aria-hidden="true" className="size-[14px]" />
        back
      </button>
      <span aria-hidden="true" className="text-nano text-line">
        /
      </span>
      <span
        className={cn(
          'text-meta font-semibold',
          path.length === 0 ? 'text-forest' : 'text-muted',
        )}
      >
        {cardName}
      </span>
      {path.map((step, index) => (
        <span key={step} className="flex items-center gap-sm">
          <span aria-hidden="true" className="text-nano text-line">
            /
          </span>
          <span
            className={cn(
              'text-meta font-semibold',
              index === path.length - 1 ? 'text-forest' : 'text-muted',
            )}
          >
            {step}
          </span>
        </span>
      ))}
    </nav>
  )
}
