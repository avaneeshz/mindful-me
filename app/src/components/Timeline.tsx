import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { categoryOf, FLAGS } from '@/data/activities'
import {
  MIDNIGHT_TICK_POSITION,
  SLOT_MINUTES,
  SLOTS_PER_ROW,
  activitiesTouchingSlot,
  flagMarkerAt,
  formatSlotRange,
  nowMarker,
  periodOfSlot,
  positionInRow,
  rowActivitySegments,
  rowSlotIndices,
  rowTickLabels,
} from '@/domain/slots'
import { PERIOD_ICONS } from '@/data/periods'
import type { ActivityList, FlagId, Period, ScheduledActivity } from '@/domain/types'
import { cn } from '@/lib/utils'

const FLAG_ICONS = Object.fromEntries(FLAGS.map((f) => [f.id, f.icon]))

/** Must match the `row-pulse` animation duration in tailwind.config.js. */
const ROW_PULSE_MS = 700

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/** Spoken description of a slot — never relies on colour to convey state. */
function describeSlot(slot: number, touching: ScheduledActivity[], flags: readonly FlagId[]): string {
  const parts: string[] = [formatSlotRange(slot)]
  if (touching.length === 0) {
    parts.push('empty')
  } else {
    parts.push(
      touching
        .map((a) => `${a.name}${a.path.length ? ` ${a.path.join(' ')}` : ''}, ${a.durationMinutes} minutes`)
        .join('; '),
    )
  }
  if (flags.length > 0) parts.push(`flagged ${flags.join(', ')}`)
  return parts.join('. ')
}

interface TimelineProps {
  activities: ActivityList
  selectedSlot: number
  now: Date
  /** Bumped by the period navigator to request a scroll + pulse. */
  jump: { period: Period; token: number } | null
  onSelectSlot: (slot: number) => void
  onDropCard: (cardName: string, slot: number) => void
}

export function Timeline({
  activities,
  selectedSlot,
  now,
  jump,
  onSelectSlot,
  onDropCard,
}: TimelineProps) {
  const containerRef = useRef<HTMLElement>(null)
  const rowRefs = useRef<Record<Period, HTMLDivElement | null>>({ day: null, night: null })
  const [pulsing, setPulsing] = useState<Period | null>(null)
  /**
   * Last slot the user actually focused. The roving tab stop follows this, not
   * only `selectedSlot` — arrow keys move focus WITHOUT selecting (deliberately,
   * so arrowing past a slot cannot discard a staged pick), so tracking selection
   * alone meant tabbing away and back dumped the user at the row's first slot.
   */
  const [focusedSlot, setFocusedSlot] = useState<number | null>(null)

  const marker = nowMarker(now)

  // Period jump: scroll the target row into view and pulse it. The other row is
  // untouched — it is never hidden, dimmed or disabled.
  useEffect(() => {
    if (!jump) return
    const row = rowRefs.current[jump.period]
    if (!row) return

    row.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'nearest',
    })

    // Drop the class first and re-add it on the next frame. A repeat tap on the
    // same segment would otherwise leave the class already applied, and a CSS
    // animation only replays when it is re-applied.
    setPulsing(null)
    let timeout = 0
    const frame = window.requestAnimationFrame(() => {
      setPulsing(jump.period)
      timeout = window.setTimeout(() => setPulsing(null), ROW_PULSE_MS)
    })
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timeout)
    }
  }, [jump])

  function focusSlot(slot: number) {
    const target = containerRef.current?.querySelector<HTMLButtonElement>(
      `[data-slot="${slot}"]`,
    )
    target?.focus()
  }

  /**
   * Roving-tabindex keyboard model: arrows move focus, Enter/Space selects.
   * Focus deliberately does NOT auto-select, so arrowing past a slot cannot
   * discard something staged in the editor.
   */
  function handleKeyDown(event: KeyboardEvent<HTMLElement>, slot: number) {
    const period = periodOfSlot(slot)
    const position = positionInRow(slot)
    const indices = rowSlotIndices(period)
    let nextPosition: number | null = null
    let nextPeriod: Period = period

    switch (event.key) {
      case 'ArrowLeft':
        nextPosition = Math.max(0, position - 1)
        break
      case 'ArrowRight':
        nextPosition = Math.min(SLOTS_PER_ROW - 1, position + 1)
        break
      case 'ArrowUp':
        nextPeriod = 'day'
        nextPosition = position
        break
      case 'ArrowDown':
        nextPeriod = 'night'
        nextPosition = position
        break
      case 'Home':
        nextPosition = 0
        break
      case 'End':
        nextPosition = SLOTS_PER_ROW - 1
        break
      default:
        return
    }

    event.preventDefault()
    const target =
      nextPeriod === period ? indices[nextPosition] : rowSlotIndices(nextPeriod)[nextPosition]
    focusSlot(target)
  }

  return (
    <section ref={containerRef} aria-labelledby="timeline-heading" className="flex flex-col gap-sm">
      <h2 id="timeline-heading" className="sr-only">
        Today’s timeline
      </h2>

      <div className="flex flex-col gap-md ipad-land:gap-sm">
        {(['day', 'night'] as const).map((period) => (
          <TimelineRow
            key={period}
            ref={(el) => {
              rowRefs.current[period] = el
            }}
            period={period}
            activities={activities}
            selectedSlot={selectedSlot}
            focusedSlot={focusedSlot}
            marker={marker.period === period ? marker.ratio : null}
            pulsing={pulsing === period}
            onFocusSlot={setFocusedSlot}
            onSelectSlot={onSelectSlot}
            onDropCard={onDropCard}
            onKeyDown={handleKeyDown}
          />
        ))}
      </div>
    </section>
  )
}

interface TimelineRowProps {
  ref: (el: HTMLDivElement | null) => void
  period: Period
  activities: ActivityList
  selectedSlot: number
  /** Last slot the user focused, on either row. Drives the roving tab stop. */
  focusedSlot: number | null
  /** 0–1 position of the current-time marker, or null if it is on the other row. */
  marker: number | null
  pulsing: boolean
  onFocusSlot: (slot: number) => void
  onSelectSlot: (slot: number) => void
  onDropCard: (cardName: string, slot: number) => void
  onKeyDown: (event: KeyboardEvent<HTMLElement>, slot: number) => void
}

function TimelineRow({
  ref,
  period,
  activities,
  selectedSlot,
  focusedSlot,
  marker,
  pulsing,
  onFocusSlot,
  onSelectSlot,
  onDropCard,
  onKeyDown,
}: TimelineRowProps) {
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null)
  const indices = rowSlotIndices(period)
  const Icon = PERIOD_ICONS[period]

  // Roving tabindex, in priority order: the slot the user last focused on THIS
  // row (so arrow-key movement survives tabbing away and back), else the
  // selected slot when it lives here, else this row's first slot. Each row
  // always has exactly one tab stop.
  const rovingSlot =
    focusedSlot !== null && indices.includes(focusedSlot)
      ? focusedSlot
      : indices.includes(selectedSlot)
        ? selectedSlot
        : indices[0]

  // The NOW badge is centred on the marker, except within half a badge-width of
  // either end — there it anchors to the edge instead, so it can never be
  // clipped by the row bounds nor slide left under the row caption.
  const markerAnchor =
    marker === null ? '' : marker <= 0.03 ? '' : marker >= 0.97 ? '-translate-x-full' : '-translate-x-1/2'

  return (
    /*
      The row is ONE object: a circular period anchor joined to the strip.

      `items-start` with the same `pt-xl` band on both children — rather than
      `items-center` — is what makes the circle exactly centred on the strip.
      Both children then start at the same y and the circle's diameter equals
      the strip's height at every breakpoint, so their centres coincide by
      construction. `items-center` would centre the anchor against the scroll
      region as a whole, which also contains the hour ruler beneath the strip,
      and would sit the circle a couple of pixels high. Nothing here is
      positioned in absolute pixels; the whole row is flex + gap.
    */
    <div className="flex items-start gap-xs">
      {/*
        Sun / Moon as the strip's left end-cap, not a floating icon beside it:
        the circle's diameter equals the strip height, so its radius equals the
        strip's rounded end-cap radius and the two read as one continuous
        shape. Day and Night are dimensionally IDENTICAL — a matched pair; only
        the surface tone differs, and each tone is the same token its own strip
        uses (warm `strip` for Day, the cooler `night-strip` composite for
        Night). No gradients.
      */}
      <div className="shrink-0 pt-xl">
        <span
          role="img"
          aria-label={period === 'day' ? 'Daytime' : 'Nighttime'}
          className={cn(
            'flex size-timeline-row items-center justify-center rounded-full border',
            'mobile:size-timeline-row-sm ipad-land:size-timeline-row-md',
            period === 'day'
              ? 'border-line bg-strip text-gold'
              : 'border-forest/20 bg-night-strip text-forest',
          )}
        >
          <Icon aria-hidden="true" className="size-[18px] mobile:size-[15px]" />
        </span>
      </div>

      {/*
        `pt-xl` reserves the band the NOW badge sits in, and lives HERE rather
        than on an outer wrapper so the badge, the marker rule and the midnight
        tick are all measured in the same coordinate space as the strip. The
        visible scrollbar is suppressed in styles/index.css; panning still
        works.
      */}
      <div className="timeline-scroll-region relative min-w-0 flex-1 overflow-x-auto pt-xl">
        {/*
          ONE coordinate space for the strip, the rules drawn over it and the
          ruler beneath it. The `left: n%` offsets of the NOW marker and the
          midnight tick resolve against THIS box, so it has to be the box that
          is exactly as wide as the strip — on mobile the strip is 720px inside
          a narrower viewport, and measuring those offsets against the scroll
          viewport instead placed both rules short of the times they mark.
        */}
        <div className="relative min-w-full mobile:w-[720px] mobile:min-w-[720px]">
        <div
          ref={ref}
          role="group"
          aria-label={`${period === 'day' ? 'Day' : 'Night'} timeline, ${
            period === 'day' ? '6am to 6pm' : '6pm to 6am'
          }`}
          className={cn(
            'timeline-row relative flex h-timeline-row w-full overflow-hidden rounded-lg mobile:h-timeline-row-sm ipad-land:h-timeline-row-md',
            period === 'day' ? 'bg-strip' : 'bg-night-strip',
            // `row-pulse` supplies the outline base; `animate-row-pulse` is the
            // real Tailwind utility, and is what makes the @keyframes reach the
            // built CSS at all. Both are required — see styles/index.css.
            pulsing && 'row-pulse animate-row-pulse',
          )}
        >
          {indices.map((slot) => {
            const touching = activitiesTouchingSlot(activities, slot)
            const flags = flagMarkerAt(activities, slot)?.flags ?? []
            const isSelected = slot === selectedSlot
            const isDragOver = dragOverSlot === slot

            return (
              <button
                key={slot}
                type="button"
                data-slot={slot}
                tabIndex={slot === rovingSlot ? 0 : -1}
                aria-current={isSelected ? 'true' : undefined}
                aria-label={`${describeSlot(slot, touching, flags)}${isSelected ? ', selected slot' : ''}`}
                onClick={() => onSelectSlot(slot)}
                onFocus={() => onFocusSlot(slot)}
                onKeyDown={(event) => onKeyDown(event, slot)}
                onDragOver={(event) => {
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'copy'
                  setDragOverSlot(slot)
                }}
                onDragLeave={() => setDragOverSlot((s) => (s === slot ? null : s))}
                onDrop={(event) => {
                  event.preventDefault()
                  setDragOverSlot(null)
                  const cardName = event.dataTransfer.getData('text/plain')
                  if (cardName) onDropCard(cardName, slot)
                }}
                style={{ width: `${100 / SLOTS_PER_ROW}%` }}
                className={cn(
                  'slot-button relative flex h-full items-stretch',
                  'hover:outline hover:outline-1.5 hover:outline-gold',
                  isSelected && 'z-[2] outline outline-2 -outline-offset-2 outline-forest',
                  // drag-over is deliberately the strongest state
                  isDragOver &&
                    'z-[4] outline outline-2.5 -outline-offset-2.5 outline-gold brightness-105',
                )}
              >
                {flags.length > 0 && (
                  // Stacked VERTICALLY — a deliberate prior bug fix; horizontal
                  // flags bled into neighbouring slots.
                  <span
                    aria-hidden="true"
                    className="absolute left-1/2 top-1/2 z-[3] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-px"
                  >
                    {flags.map((flag) => {
                      const FlagIcon = FLAG_ICONS[flag]
                      return FlagIcon ? (
                        <FlagIcon key={flag} className="size-[8px] text-forest" strokeWidth={3} />
                      ) : null
                    })}
                  </span>
                )}
              </button>
            )
          })}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[1]">
            {rowActivitySegments(activities, period).map((segment) => (
              <span
                key={`${segment.activity.id}-${segment.startPosition}`}
                data-activity-span={segment.activity.id}
                className="absolute inset-y-0"
                style={{
                  left: `${(segment.startPosition / SLOTS_PER_ROW) * 100}%`,
                  width: `${(segment.minutes / SLOT_MINUTES / SLOTS_PER_ROW) * 100}%`,
                  background: categoryOf(segment.activity.name ?? '').light,
                }}
              />
            ))}
          </div>
        </div>
        {/*
          Midnight tick — only the Night row crosses midnight. The "12a" caption
          now lives in the ruler beneath the row with every other hour label;
          only the boundary rule itself is drawn here.
        */}
        {period === 'night' && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-0 h-timeline-row w-px bg-line mobile:h-timeline-row-sm ipad-land:h-timeline-row-md"
            style={{ left: `${(MIDNIGHT_TICK_POSITION / SLOTS_PER_ROW) * 100}%` }}
          />
        )}

        {/* Exactly one current-time marker exists, on the row that holds now. */}
        {marker !== null && (
          <>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-0 h-timeline-row w-[2px] bg-forest mobile:h-timeline-row-sm ipad-land:h-timeline-row-md"
              style={{ left: `${marker * 100}%` }}
            />
            {/* Sits in the band `pt-xl` reserves above the strip. */}
            <span
              className={cn(
                'pointer-events-none absolute -top-xl z-[6] rounded-sm bg-forest px-sm py-xs text-nano font-bold text-white',
                markerAnchor,
              )}
              style={{ left: `${marker * 100}%` }}
            >
              NOW
            </span>
          </>
        )}
        {/*
          Hour ruler — Acceptance Criterion 1. Without it the rows carry no
          absolute time reference at all, so "where does this period start and
          end" can only be answered from the caption text.

          Lives INSIDE the scroll region so it pans with the strip it labels;
          outside it, the two drifted apart the moment the strip was panned.

          Decorative for assistive tech: every slot button already announces its
          own full time range.
        */}
        <div
          aria-hidden="true"
          className="mt-xs flex w-full justify-between px-px text-nano font-medium text-muted"
        >
          {rowTickLabels(period).map((label, index) => (
            <span key={`${label}-${index}`}>{label}</span>
          ))}
        </div>
        </div>
      </div>
    </div>
  )
}
