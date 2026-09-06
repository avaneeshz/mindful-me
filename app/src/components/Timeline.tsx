import { useRef, useState, type KeyboardEvent } from 'react'
import {
  MIDNIGHT_TICK_POSITION,
  SLOT_MINUTES,
  SLOTS_PER_ROW,
  activitiesTouchingSlot,
  flagMarkerAt,
  focusStopsEqual,
  formatActivityRange,
  formatSlotRange,
  nowMarker,
  rowActivitySegments,
  rowFocusStops,
  rowHourTickLabels,
  rowSlotIndices,
  slotIndexFromMinutes,
  slotMinuteRange,
  tickLabelPositions,
  type RowFocusStop,
} from '@/domain/slots'
import { isWindowFull } from '@/domain/scheduling'
import { PERIOD_ICONS } from '@/data/periods'
import { useTheme } from '@/state/ThemeContext'
import type { ActivityList, FlagId, Period, ScheduledActivity } from '@/domain/types'
import { cn } from '@/lib/utils'

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

/** Spoken description of one activity's own rendered segment — its name, path, and real time range. */
function describeActivity(activity: ScheduledActivity): string {
  const label = `${activity.name}${activity.path.length ? ` ${activity.path.join(' ')}` : ''}`
  return `${label}, ${formatActivityRange(activity.startMinutes, activity.durationMinutes)}`
}

function activityDataSelector(activityId: string): string {
  return `[data-activity="${CSS.escape(activityId)}"]`
}

interface TimelineProps {
  activities: ActivityList
  selectedSlot: number
  /**
   * Real device time, or `null` when the board is viewing a day other than
   * today (BL-2) — the NOW marker/line only ever makes sense on the real
   * current day, so `null` here means "draw no marker at all" rather than a
   * marker computed against the wrong day's timeline.
   */
  now: Date | null
  onSelectSlot: (slot: number) => void
  onDropCard: (cardName: string, slot: number) => void
  /**
   * Clicking (or keyboard-activating) a specific activity's own rendered
   * segment — opens that activity's edit modal directly, rather than merely
   * selecting the 30-minute slot it lives in. See `state/boardReducer.ts`'s
   * `selectActivity` action.
   */
  onSelectActivity: (id: string) => void
}

export function Timeline({
  activities,
  selectedSlot,
  now,
  onSelectSlot,
  onDropCard,
  onSelectActivity,
}: TimelineProps) {
  const containerRef = useRef<HTMLElement>(null)
  /**
   * Last stop the user actually focused — a grid slot OR an activity segment.
   * The roving tab stop follows this, not only `selectedSlot` — arrow keys
   * move focus WITHOUT selecting (deliberately, so arrowing past a stop
   * cannot discard a staged pick), so tracking selection alone meant tabbing
   * away and back dumped the user at the row's first stop.
   */
  const [focusedStop, setFocusedStop] = useState<RowFocusStop | null>(null)

  const marker = now ? nowMarker(now) : null

  function focusStop(stop: RowFocusStop) {
    const selector = stop.kind === 'slot' ? `[data-slot="${stop.slot}"]` : activityDataSelector(stop.activityId)
    const target = containerRef.current?.querySelector<HTMLButtonElement>(selector)
    target?.focus()
  }

  /**
   * Roving-tabindex keyboard model, walking `rowFocusStops` (grid slots with
   * free capacity, interleaved with activity segments) instead of the old
   * fixed 24-slot array. Arrows move focus, Enter/Space is free — a real
   * `<button>` handles that natively once the control genuinely is one.
   * Up/Down land on the other row's stop at the nearest equivalent position;
   * it does not try to preserve "same activity" (not required — see the
   * task's own confirmed decision).
   */
  function handleKeyDown(event: KeyboardEvent<HTMLElement>, period: Period, stop: RowFocusStop) {
    const stops = rowFocusStops(activities, period)
    const index = Math.max(
      0,
      stops.findIndex((s) => focusStopsEqual(s, stop)),
    )

    let nextStops = stops
    let nextIndex = index

    switch (event.key) {
      case 'ArrowLeft':
        nextIndex = Math.max(0, index - 1)
        break
      case 'ArrowRight':
        nextIndex = Math.min(stops.length - 1, index + 1)
        break
      case 'ArrowUp':
      case 'ArrowDown': {
        const nextPeriod: Period = event.key === 'ArrowUp' ? 'day' : 'night'
        nextStops = rowFocusStops(activities, nextPeriod)
        if (nextStops.length === 0) return
        const ratio = stops.length > 1 ? index / (stops.length - 1) : 0
        nextIndex = Math.round(ratio * (nextStops.length - 1))
        break
      }
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = stops.length - 1
        break
      default:
        return
    }

    event.preventDefault()
    const target = nextStops[nextIndex]
    if (target) focusStop(target)
  }

  return (
    <section ref={containerRef} aria-labelledby="timeline-heading" className="flex flex-col gap-sm">
      <h2 id="timeline-heading" className="sr-only">
        {now ? 'Today’s timeline' : 'Timeline'}
      </h2>

      <div className="flex flex-col gap-md ipad-land:gap-sm">
        {(['day', 'night'] as const).map((period) => (
          <TimelineRow
            key={period}
            period={period}
            activities={activities}
            selectedSlot={selectedSlot}
            focusedStop={focusedStop}
            marker={marker && marker.period === period ? marker.ratio : null}
            onFocusStop={setFocusedStop}
            onSelectSlot={onSelectSlot}
            onDropCard={onDropCard}
            onSelectActivity={onSelectActivity}
            onKeyDown={handleKeyDown}
          />
        ))}
      </div>
    </section>
  )
}

interface TimelineRowProps {
  period: Period
  activities: ActivityList
  selectedSlot: number
  /** Last stop the user focused, on either row. Drives the roving tab stop. */
  focusedStop: RowFocusStop | null
  /** 0–1 position of the current-time marker, or null if it is on the other row. */
  marker: number | null
  onFocusStop: (stop: RowFocusStop) => void
  onSelectSlot: (slot: number) => void
  onDropCard: (cardName: string, slot: number) => void
  onSelectActivity: (id: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLElement>, period: Period, stop: RowFocusStop) => void
}

function TimelineRow({
  period,
  activities,
  selectedSlot,
  focusedStop,
  marker,
  onFocusStop,
  onSelectSlot,
  onDropCard,
  onSelectActivity,
  onKeyDown,
}: TimelineRowProps) {
  const { theme, setTheme } = useTheme()
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null)
  const indices = rowSlotIndices(period)
  const stops = rowFocusStops(activities, period)
  const tickLabels = rowHourTickLabels(period)
  const tickPositions = tickLabelPositions()
  const Icon = PERIOD_ICONS[period]
  // Section A — the theme toggle lives right here, on the Sun/Moon end-caps
  // already sitting beside each row, not a new settings control. This is a
  // DIFFERENT axis from `isCurrentPeriod` below: which THEME the user chose
  // (a preference) versus which period real device time is in right now (a
  // fact) — the two can disagree (it's genuinely night, but the user prefers
  // the light theme) and both render independently on the same cap.
  const isThemeSelected = period === 'day' ? theme === 'light' : theme === 'dark'
  // This row holds the real current time right now — the exact condition the
  // Sun/Moon end-cap glow keys off. `marker` is already `null` on whichever
  // row is NOT the live period (see the `Timeline` component above), so
  // there's no separate "is this the current period" computation to get out
  // of sync with the marker itself.
  const isCurrentPeriod = marker !== null

  // Roving tabindex, in priority order: the stop the user last focused on THIS
  // row (so arrow-key movement survives tabbing away and back), else the
  // selected slot's own stop when it lives here and still has one, else this
  // row's first stop. Each row always has exactly one tab stop.
  const selectedAsStop: RowFocusStop = { kind: 'slot', slot: selectedSlot }
  const rovingStop =
    focusedStop !== null && stops.some((s) => focusStopsEqual(s, focusedStop))
      ? focusedStop
      : stops.some((s) => focusStopsEqual(s, selectedAsStop))
        ? selectedAsStop
        : stops[0]

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
        the circle's diameter equals the strip height, so its radius equals
        the strip's rounded end-cap radius and the two read as one continuous
        shape. Day and Night are dimensionally IDENTICAL — a matched pair.

        Also a real button now (Section A): clicking it sets the app's THEME
        (light for the Sun, dark for the Moon) — `isThemeSelected` inverts
        the fill exactly like a selected chip elsewhere in the product, the
        one deliberate "colour" here being the theme's own invert pair, not
        a new hue. The glow below is a SEPARATE, unchanged concern (rule:
        "sun/moon glow... unchanged" this round) — it still keys off real
        device time (`isCurrentPeriod`), never the chosen theme, and both
        can be true or false independently of each other.
      */}
      <div className="shrink-0 pt-xl">
        <button
          type="button"
          onClick={() => setTheme(period === 'day' ? 'light' : 'dark')}
          aria-pressed={isThemeSelected}
          aria-label={period === 'day' ? 'Switch to light theme' : 'Switch to dark theme'}
          className={cn(
            'flex size-timeline-row items-center justify-center rounded-full border transition-colors duration-200',
            'mobile:size-timeline-row-sm ipad-land:size-timeline-row-md',
            isThemeSelected ? 'border-inv-bg bg-inv-bg text-inv-ink' : 'border-line bg-surface text-ink-dim',
            // Glows only on whichever row is the REAL current period, right
            // now — unrelated to `isThemeSelected` above. The animated pulse
            // is disabled under prefers-reduced-motion
            // (`motion-reduce:animate-none`); the paired `shadow-[...]`
            // utility then supplies the glow's resting frame as a static
            // fallback so reduced motion loses the pulse, never the glow.
            isCurrentPeriod &&
              (period === 'day'
                ? 'shadow-[0_0_0_3px_rgba(212,168,87,0.18),0_0_14px_2px_rgba(212,168,87,0.45)] animate-anchor-glow motion-reduce:animate-none'
                : 'shadow-[0_0_0_3px_rgba(255,255,255,0.2),0_0_14px_2px_rgba(255,255,255,0.5)] animate-anchor-glow-night motion-reduce:animate-none'),
          )}
        >
          <Icon aria-hidden="true" className="size-[18px] mobile:size-[15px]" />
        </button>
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
          role="group"
          aria-label={`${period === 'day' ? 'Day' : 'Night'} timeline, ${
            period === 'day' ? '6am to 6pm' : '6pm to 6am'
          }`}
          className={cn(
            'timeline-row relative flex h-timeline-row w-full overflow-hidden rounded-lg mobile:h-timeline-row-sm ipad-land:h-timeline-row-md',
            // Section C — no illustrated scenery any more (a partial
            // reversal of the earlier decorative-budget decision, flagged
            // in the PR description). Day: plain flat surface tone ("white
            // only"). Night: a fixed grey, independent of the light/dark
            // theme toggle — the one deliberate exception to "theme flows
            // through everything" (`--night-strip-fixed`, styles/index.css).
            period === 'day' ? 'bg-surface' : 'bg-night-strip-fixed',
          )}
        >
          {indices.map((slot) => {
            const touching = activitiesTouchingSlot(activities, slot)
            const flags = flagMarkerAt(activities, slot)?.flags ?? []
            const isSelected = slot === selectedSlot
            const isDragOver = dragOverSlot === slot
            const windowFull = isWindowFull(activities, slotMinuteRange(slot).start, SLOT_MINUTES)
            const isRovingSlot = rovingStop?.kind === 'slot' && rovingStop.slot === slot

            return (
              <button
                key={slot}
                type="button"
                data-slot={slot}
                // A slot with zero free capacity left has nothing meaningful
                // of its own to do any more — the activity segment(s)
                // covering it are the sole meaningful control there now, so
                // it drops out of the Tab sequence entirely (never a tab
                // stop), mirroring `TileRow.tsx`'s `hiddenFromAT` pattern.
                // Everything else about the slot button — its background,
                // hover ring, `describeSlot` label, drag handling — is
                // unchanged.
                tabIndex={windowFull ? -1 : isRovingSlot ? 0 : -1}
                aria-current={isSelected ? 'true' : undefined}
                aria-label={`${describeSlot(slot, touching, flags)}${isSelected ? ', selected slot' : ''}`}
                onClick={() => onSelectSlot(slot)}
                onFocus={() => onFocusStop({ kind: 'slot', slot })}
                onKeyDown={(event) => onKeyDown(event, period, { kind: 'slot', slot })}
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
                  // No more illustrated scenery behind an empty slot (Section
                  // C) — a flat surface for Day, a fixed grey for Night. The
                  // Night row's background no longer follows the light/dark
                  // theme, so its own states reach for the fixed-grey's own
                  // companion tokens instead of `ink`, guaranteeing contrast
                  // against that one surface regardless of which theme the
                  // rest of the app is in; Day's states use `ink` normally,
                  // since its own surface DOES follow the theme.
                  period === 'day'
                    ? [
                        'hover:bg-ink/10 hover:outline hover:outline-1.5 hover:outline-ink-dim',
                        isSelected && 'z-[2] bg-ink/10 outline outline-2 -outline-offset-2 outline-ink',
                        isDragOver && 'z-[4] bg-ink/15 outline outline-2.5 -outline-offset-2.5 outline-ink',
                      ]
                    : [
                        'hover:bg-night-strip-fixed-ink/10 hover:outline hover:outline-1.5 hover:outline-night-strip-fixed-ink',
                        isSelected &&
                          'z-[2] bg-night-strip-fixed-ink/10 outline outline-2 -outline-offset-2 outline-night-strip-fixed-ink',
                        isDragOver &&
                          'z-[4] bg-night-strip-fixed-ink/15 outline outline-2.5 -outline-offset-2.5 outline-night-strip-fixed-ink',
                      ],
                )}
              >
                {flags.length > 0 && (
                  // Stacked VERTICALLY — a deliberate prior bug fix; horizontal
                  // flags bled into neighbouring slots. A small opaque backing
                  // plate, period-matched the same way the slot states above
                  // are, so it stays legible on either row regardless of theme.
                  // z-[6] so it stays visible even under an activity-segment
                  // button (z-[5]) covering the same slot — legacy-only
                  // rendering path, see `domain/slots.ts` `flagMarkerAt`.
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute left-1/2 top-1/2 z-[6] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-px rounded-full px-[3px] py-[2px] shadow-elevation-1',
                      period === 'day' ? 'bg-inv-bg' : 'bg-night-strip-fixed-ink',
                    )}
                  >
                    {flags.map((flag) => (
                      <span
                        key={flag}
                        className={cn('size-[6px] rounded-full', period === 'day' ? 'bg-inv-ink' : 'bg-night-strip-fixed')}
                      />
                    ))}
                  </span>
                )}
              </button>
            )
          })}
          {/*
            Each real activity's own rendered span is now a genuine, focusable
            control — clicking (or Enter/Space-activating) it dispatches
            `onSelectActivity`, opening THAT activity's own edit modal
            directly, rather than merely selecting the 30-minute slot beneath
            it. The wrapping div stays `pointer-events-none` so a click on the
            empty (uncovered) part of a slot still reaches the plain slot
            button underneath — each activity button re-enables its own
            pointer events individually.

            z-[5] — above the slot's own isSelected (z-2) and isDragOver (z-4)
            states — so a click or keyboard Enter on the segment always
            resolves to the activity, even when it also happens to sit inside
            the currently-selected or drag-hovered slot.

            Drag-and-drop regression guard: a card dropped from the tile-row
            popup onto a point that sits under one of these buttons must still
            work. Wiring the identical onDragOver/onDragLeave/onDrop handlers
            here, anchored at the covering activity's own start slot
            (`slotIndexFromMinutes`), is sufficient — `computeCandidateSchedule`
            already snaps a placement forward past busy time (rule 5), so the
            actual placement resolves correctly even though the drop's pixel
            position is not what determines it.
          */}
          <div className="pointer-events-none absolute inset-0 z-[1]">
            {rowActivitySegments(activities, period).map((segment) => {
              const anchorSlot = slotIndexFromMinutes(segment.activity.startMinutes)
              const isFocusableActivity =
                rovingStop?.kind === 'activity' && rovingStop.activityId === segment.activity.id
              const isDragOverActivity = dragOverSlot === anchorSlot

              return (
                <button
                  key={`${segment.activity.id}-${segment.startPosition}`}
                  type="button"
                  data-activity={segment.activity.id}
                  tabIndex={isFocusableActivity ? 0 : -1}
                  aria-label={describeActivity(segment.activity)}
                  onClick={() => onSelectActivity(segment.activity.id)}
                  onFocus={() => onFocusStop({ kind: 'activity', activityId: segment.activity.id })}
                  onKeyDown={(event) => onKeyDown(event, period, { kind: 'activity', activityId: segment.activity.id })}
                  onDragOver={(event) => {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'copy'
                    setDragOverSlot(anchorSlot)
                  }}
                  onDragLeave={() => setDragOverSlot((s) => (s === anchorSlot ? null : s))}
                  onDrop={(event) => {
                    event.preventDefault()
                    setDragOverSlot(null)
                    const cardName = event.dataTransfer.getData('text/plain')
                    if (cardName) onDropCard(cardName, anchorSlot)
                  }}
                  className={cn(
                    'pointer-events-auto absolute inset-y-0 z-[5] cursor-pointer',
                    period === 'day'
                      ? [
                          'hover:outline hover:outline-1.5 hover:-outline-offset-1.5 hover:outline-ink-dim',
                          'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink',
                          isDragOverActivity && 'outline outline-2.5 -outline-offset-2.5 outline-ink',
                        ]
                      : [
                          'hover:outline hover:outline-1.5 hover:-outline-offset-1.5 hover:outline-night-strip-fixed-ink',
                          'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-night-strip-fixed-ink',
                          isDragOverActivity && 'outline outline-2.5 -outline-offset-2.5 outline-night-strip-fixed-ink',
                        ],
                  )}
                  style={{
                    left: `${(segment.startPosition / SLOTS_PER_ROW) * 100}%`,
                    width: `${(segment.minutes / SLOT_MINUTES / SLOTS_PER_ROW) * 100}%`,
                    // No more per-item colour (Section A) — every real
                    // activity's segment is the same flat, theme-aware wash,
                    // with a matching hairline for its edges. The Night row's
                    // background is the one fixed, theme-independent surface
                    // (Section C), so segments drawn on it reach for that
                    // surface's own fixed companion tokens instead, the same
                    // reasoning the slot states above already follow.
                    background: period === 'day' ? 'var(--line-soft)' : 'var(--night-strip-fixed-line)',
                    boxShadow:
                      period === 'day'
                        ? 'inset 0 0 0 1px var(--line)'
                        : 'inset 0 0 0 1px var(--night-strip-fixed-ink)',
                  }}
                />
              )
            })}
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
            className="pointer-events-none absolute top-0 h-timeline-row w-px bg-night-strip-fixed-line mobile:h-timeline-row-sm ipad-land:h-timeline-row-md"
            style={{ left: `${(MIDNIGHT_TICK_POSITION / SLOTS_PER_ROW) * 100}%` }}
          />
        )}

        {/*
          Exactly one current-time marker exists, on the row that holds now.
          Day's rule/badge use `ink`/`inv-*` normally (its own surface follows
          the theme). Night draws on the fixed grey strip, so it reaches for
          that surface's own fixed companion tokens instead — same reasoning
          as everything else drawn on that one surface.
        */}
        {marker !== null && (
          <>
            <span
              aria-hidden="true"
              className={cn(
                'pointer-events-none absolute top-0 h-timeline-row w-[2px] mobile:h-timeline-row-sm ipad-land:h-timeline-row-md',
                period === 'day' ? 'bg-ink' : 'bg-night-strip-fixed-ink',
              )}
              style={{ left: `${marker * 100}%` }}
            />
            {/* Sits in the band `pt-xl` reserves above the strip. */}
            <span
              className={cn(
                'pointer-events-none absolute -top-xl z-[6] rounded-sm px-sm py-xs text-nano font-bold',
                period === 'day' ? 'bg-inv-bg text-inv-ink' : 'bg-night-strip-fixed-ink text-night-strip-fixed',
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

          Section C — every hour now, not just start/midpoint/end, and drawn
          in its OWN row below the strip rather than overlaid on top of it,
          so a real scheduled-activity block can never cover one. Each
          label is absolutely positioned at its real percentage-of-day
          (`tickLabelPositions`) rather than relying on flexbox
          `justify-between`, which only happened to line up before because
          3 evenly-time-spaced labels are also evenly PIXEL-spaced when
          every label is roughly the same width — with 13 labels of
          genuinely different widths ("6AM" vs "7"), that stops being true.
          The first label anchors its left edge, the last its right edge,
          everything between is centred on its own tick — the same
          convention the reference implementation uses.

          Lives INSIDE the scroll region so it pans with the strip it labels;
          outside it, the two drifted apart the moment the strip was panned.

          Decorative for assistive tech: every slot button already announces its
          own full time range.
        */}
        <div aria-hidden="true" className="relative mt-xs h-[14px] w-full">
          {tickLabels.map((label, index) => (
            <span
              key={`${label}-${index}`}
              className={cn(
                'absolute top-0 whitespace-nowrap text-nano font-medium text-ink-dim',
                index === 0 ? '' : index === tickLabels.length - 1 ? '-translate-x-full' : '-translate-x-1/2',
              )}
              style={{ left: `${tickPositions[index]}%` }}
            >
              {label}
            </span>
          ))}
        </div>
        </div>
      </div>
    </div>
  )
}
