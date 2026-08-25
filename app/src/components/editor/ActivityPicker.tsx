import { useState } from 'react'
import { ChevronLeft, Info } from 'lucide-react'
import { ACTIVITY_CARDS, CATEGORIES } from '@/data/activities'
import type { ActivityCard } from '@/domain/types'
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
  onPickCard: (cardName: string) => void
  onPickOption: (level: number, value: string) => void
  onBack: () => void
}

/** e.g. "1 activity totalling 30 minutes", "2 activities totalling 30 minutes". */
export function describeSlotContents(activityCount: number, usedMinutes: number): string {
  const activities = `${activityCount} ${activityCount === 1 ? 'activity' : 'activities'}`
  const minutes = `${usedMinutes} ${usedMinutes === 1 ? 'minute' : 'minutes'}`
  return `${activities} totalling ${minutes}`
}

export function ActivityPicker({
  staging,
  atCapacity,
  activityCount,
  usedMinutes,
  onPickCard,
  onPickOption,
  onBack,
}: ActivityPickerProps) {
  const [draggingCard, setDraggingCard] = useState<string | null>(null)
  const options = stagingOptions(staging)

  // --- Drilled into a card: breadcrumb + sub-option chips ---
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

  // --- Card grid ---
  //
  // `atCapacity` describes the CURRENTLY SELECTED slot only — it must never
  // hide the grid itself. The grid is the drag source for every slot on the
  // timeline, not just the selected one, so a full selected slot only blocks
  // the manual click-to-add path (already enforced by the reducer, which
  // no-ops `pickCard` once `maxScheduleDuration` is 0) and dims/announces
  // accordingly; it stays mounted, visible and draggable so the user can
  // still drag a card onto any other, non-full slot.
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

      <div className={cn('picker-grid', atCapacity && 'opacity-40')}>
        {ACTIVITY_CARDS.map((card) => (
          <ActivityTile
            key={card.name}
            card={card}
            disabled={false}
            hiddenFromAT={atCapacity}
            isDragging={draggingCard === card.name}
            onPick={() => onPickCard(card.name)}
            onDragStart={() => setDraggingCard(card.name)}
            onDragEnd={() => setDraggingCard(null)}
          />
        ))}
      </div>
    </div>
  )
}

function ActivityTile({
  card,
  disabled,
  hiddenFromAT,
  isDragging,
  onPick,
  onDragStart,
  onDragEnd,
}: {
  card: ActivityCard
  disabled: boolean
  /**
   * True while the currently SELECTED slot is full. The tile stays visible,
   * draggable and clickable (a click safely no-ops — `pickCard` in the
   * reducer already rejects it once `maxScheduleDuration` is 0) — only its
   * presence in the accessibility tree and tab order is withdrawn, matching
   * the "This slot is full" status message that explains why. Deliberately
   * NOT the same as `disabled`: `disabled` would also block dragging, which
   * must keep working so the card can still be dropped on a different slot.
   */
  hiddenFromAT: boolean
  isDragging: boolean
  onPick: () => void
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const category = CATEGORIES[card.categoryId]
  const Icon = card.icon

  return (
    <button
      type="button"
      draggable={!disabled}
      disabled={disabled}
      tabIndex={disabled || hiddenFromAT ? -1 : undefined}
      aria-hidden={hiddenFromAT || undefined}
      onClick={onPick}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', card.name)
        event.dataTransfer.effectAllowed = 'copy'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      aria-label={
        card.sub ? `${card.name}, ${card.sub.length} options` : card.name
      }
      className={cn(
        // FLAT category fill — the prototype's 24 per-tile gradients are exactly
        // the decorative-gradient anti-pattern CLAUDE.md forbids.
        'relative flex aspect-square cursor-grab flex-col items-center justify-center gap-xs',
        'rounded-lg p-xs transition-shadow',
        // Hover lifts with elevation-2 only. No scale transform: that jitters
        // the grid and shifts neighbouring tiles.
        'hover:shadow-elevation-2 active:cursor-grabbing',
        isDragging && 'scale-[0.96] opacity-40',
      )}
      style={{ background: category.deep }}
    >
      <Icon aria-hidden="true" className={cn('size-[22px] shrink-0', category.onDeep)} />
      <span
        aria-hidden="true"
        className={cn(
          'w-full truncate px-px text-center text-micro font-semibold',
          category.onDeep,
          // Only set where the flat pairing misses WCAG AA — see index.css.
          category.onDeepBoost,
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
    </button>
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
