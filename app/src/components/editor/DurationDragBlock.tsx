import { useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { formatMinutes } from '@/domain/slots'
import {
  clampMove,
  clampResizeStart,
  DURATION_STEP_MINUTES,
  maxContiguousDuration,
  MIN_DURATION_MINUTES,
  moveBounds,
} from '@/domain/scheduling'
import type { ActivityList } from '@/domain/types'
import { cn } from '@/lib/utils'

/**
 * The default and only visible duration control (Modal Redesign §C) — a mini
 * time ruler with a draggable/resizable pill, replacing the old always-shown
 * numeric stepper (which survives as `DurationStepperFallback`, behind
 * `SHOW_DURATION_STEPPER_FALLBACK`).
 *
 * Three independently focusable controls, each a real `role="slider"`:
 *   - the pill BODY moves the whole block (start changes, duration fixed)
 *   - the LEFT edge resizes from the start (end fixed)
 *   - the RIGHT edge resizes from the end (start fixed — this one is just
 *     the existing `stepDuration`/`setDuration` actions, reused verbatim)
 * Pointer drag and keyboard arrows on each control dispatch the exact same
 * reducer actions (`setStagingStart` / `resizeStagingStart` / `setDuration`)
 * — no separate "keyboard" vs "pointer" duration logic anywhere.
 *
 * Hard-stop, not reject-and-snap-back: every candidate position this ever
 * proposes (drag or keyboard) is clamped into the valid range by the SAME
 * `clampMove`/`clampResizeStart`/duration-ceiling functions the reducer
 * itself uses (`domain/scheduling.ts`) — rule 1, just a new UI for it.
 *
 * The pill carries no text of its own — the modal's own header already
 * names the activity — and instead two live time labels float ABOVE the
 * track, each anchored over its own edge and sliding with it as the pill
 * moves/resizes (approved mockup).
 */

/** Half the visible ruler window, in minutes either side of the anchor. */
const WINDOW_HALF_MINUTES = 180
const MINUTES_PER_DAY = 1440

export const DURATION_DRAG_MESSAGE_ID = 'duration-drag-capacity-message'

interface DurationDragBlockProps {
  activities: ActivityList
  cardName: string
  startMinutes: number
  durationMinutes: number
  editingId: string | null
  onMove: (minutes: number) => void
  onResizeStart: (minutes: number) => void
  onSetDuration: (minutes: number) => void
}

export function DurationDragBlock({
  activities,
  cardName,
  startMinutes,
  durationMinutes,
  editingId,
  onMove,
  onResizeStart,
  onSetDuration,
}: DurationDragBlockProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragKind, setDragKind] = useState<'move' | 'resize-start' | 'resize-end' | null>(null)

  // Fixed for the component's lifetime (one modal open) so the ruler doesn't
  // visually re-center under a drag in progress — computed once from the
  // value staging had when this control first mounted.
  const [windowStart] = useState(() =>
    Math.max(0, Math.min(MINUTES_PER_DAY - WINDOW_HALF_MINUTES * 2, startMinutes - WINDOW_HALF_MINUTES)),
  )
  const windowEnd = windowStart + WINDOW_HALF_MINUTES * 2
  const windowMinutes = windowEnd - windowStart

  function pctFor(minute: number): number {
    return ((minute - windowStart) / windowMinutes) * 100
  }

  function minutesPerPixel(): number {
    const width = trackRef.current?.getBoundingClientRect().width ?? 1
    return windowMinutes / Math.max(1, width)
  }

  function beginDrag(kind: 'move' | 'resize-start' | 'resize-end', event: ReactPointerEvent) {
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragKind(kind)
    const anchorClientX = event.clientX
    const anchorStart = startMinutes
    const anchorDuration = durationMinutes
    const perPixel = minutesPerPixel()

    function handleMove(moveEvent: PointerEvent) {
      const deltaPixels = moveEvent.clientX - anchorClientX
      const deltaMinutes = Math.round((deltaPixels * perPixel) / DURATION_STEP_MINUTES) * DURATION_STEP_MINUTES
      if (kind === 'move') {
        onMove(anchorStart + deltaMinutes)
      } else if (kind === 'resize-start') {
        onResizeStart(anchorStart + deltaMinutes)
      } else {
        onSetDuration(anchorDuration + deltaMinutes)
      }
    }
    function handleUp() {
      setDragKind(null)
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }

  function onMoveKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      onMove(clampMove(activities, startMinutes, durationMinutes, startMinutes - DURATION_STEP_MINUTES, editingId))
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      onMove(clampMove(activities, startMinutes, durationMinutes, startMinutes + DURATION_STEP_MINUTES, editingId))
    }
  }

  function onResizeStartKeyDown(event: KeyboardEvent) {
    const currentEnd = startMinutes + durationMinutes
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      onResizeStart(clampResizeStart(activities, startMinutes, currentEnd, startMinutes - DURATION_STEP_MINUTES, editingId))
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      onResizeStart(clampResizeStart(activities, startMinutes, currentEnd, startMinutes + DURATION_STEP_MINUTES, editingId))
    }
  }

  function onResizeEndKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      onSetDuration(Math.max(MIN_DURATION_MINUTES, durationMinutes - DURATION_STEP_MINUTES))
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      onSetDuration(durationMinutes + DURATION_STEP_MINUTES)
    }
  }

  const moveBoundsDesc = `${formatMinutes(startMinutes)}, duration ${durationMinutes} minutes`

  // A shared explanatory message whenever ANY edge is pinned against a
  // neighbour or the end of the day — the same "state the limit, don't just
  // silently apply it" pattern `DurationStepperFallback`'s ceiling message
  // uses, now covering all three controls (move/resize-start/resize-end)
  // instead of only duration growth.
  const { min: moveMin, max: moveMax } = moveBounds(activities, startMinutes, durationMinutes, editingId)
  const endCeiling = maxContiguousDuration(activities, startMinutes, editingId)
  const pinned = startMinutes <= moveMin || startMinutes >= moveMax || durationMinutes >= endCeiling

  const neighbors = activities.filter(
    (a) =>
      a.id !== editingId &&
      a.durationMinutes > 0 &&
      a.startMinutes < windowEnd &&
      a.startMinutes + a.durationMinutes > windowStart,
  )

  const pillLeft = Math.max(0, pctFor(startMinutes))
  const pillRight = Math.min(100, pctFor(startMinutes + durationMinutes))

  return (
    <div className="flex flex-col gap-xs">
      {/* Section D — the "Duration" section label is gone; the ruler shows
          directly, unlabeled. Still named for assistive tech, just not
          visibly — `sr-only`, not removed outright, so the sliders' own
          `aria-labelledby` still resolves to something meaningful. */}
      <p id="duration-drag-label" className="sr-only">
        Duration
      </p>
      {/* Live edge time labels float above the track, anchored directly over
          the pill's own left/right edge, sliding with it as it's
          dragged/resized/keyboard-moved. */}
      <div className="relative h-[26px] w-full">
        <EdgeTimeLabel leftPct={pillLeft} minutes={startMinutes} />
        <EdgeTimeLabel leftPct={pillRight} minutes={startMinutes + durationMinutes} />
      </div>
      <div ref={trackRef} className="relative h-[40px] w-full overflow-hidden rounded-md bg-bg">
        {neighbors.map((a) => {
          const left = Math.max(0, pctFor(a.startMinutes))
          const right = Math.min(100, pctFor(a.startMinutes + a.durationMinutes))
          if (right <= left) return null
          return (
            <div
              key={a.id}
              aria-hidden="true"
              // Square corners — flush against the pill or against each
              // other, so the strip reads as one continuous timeline. No
              // per-item colour any more (Section A) — every neighbour is
              // the same flat, theme-aware wash.
              className="absolute inset-y-0 flex items-center overflow-hidden bg-line-soft px-xs text-nano font-semibold text-ink-dim"
              style={{ left: `${left}%`, width: `${right - left}%` }}
            >
              <span className="truncate">{a.name}</span>
            </div>
          )
        })}

        {/* The staged pill — no text inside; the modal header already names
            the activity, and the edge labels above carry the times. */}
        <div
          className="absolute inset-y-[4px] rounded-md shadow-elevation-1"
          style={{ left: `${pillLeft}%`, width: `${pillRight - pillLeft}%` }}
        >
          <div
            role="slider"
            tabIndex={0}
            aria-labelledby="duration-drag-label"
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={MINUTES_PER_DAY}
            aria-valuenow={startMinutes}
            aria-valuetext={moveBoundsDesc}
            aria-describedby={pinned ? DURATION_DRAG_MESSAGE_ID : undefined}
            onPointerDown={(event) => beginDrag('move', event)}
            onKeyDown={onMoveKeyDown}
            className={cn(
              'h-full w-full cursor-grab rounded-md bg-inv-bg',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
              dragKind === 'move' && 'cursor-grabbing',
            )}
          />

          {/* Left (start) resize handle — a short grip straddling the edge. */}
          <div
            role="slider"
            tabIndex={0}
            aria-label={`Resize ${cardName}'s start time`}
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={MINUTES_PER_DAY}
            aria-valuenow={startMinutes}
            aria-valuetext={formatMinutes(startMinutes)}
            aria-describedby={pinned ? DURATION_DRAG_MESSAGE_ID : undefined}
            onPointerDown={(event) => {
              event.stopPropagation()
              beginDrag('resize-start', event)
            }}
            onKeyDown={(event) => {
              event.stopPropagation()
              onResizeStartKeyDown(event)
            }}
            className="absolute left-0 top-1/2 h-[24px] w-[10px] -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full bg-inv-ink/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          />

          {/* Right (end) resize handle — reuses setDuration, nothing new. */}
          <div
            role="slider"
            tabIndex={0}
            aria-label={`Resize ${cardName}'s duration`}
            aria-orientation="horizontal"
            aria-valuemin={MIN_DURATION_MINUTES}
            aria-valuenow={durationMinutes}
            aria-valuetext={`${durationMinutes} minutes`}
            aria-describedby={pinned ? DURATION_DRAG_MESSAGE_ID : undefined}
            onPointerDown={(event) => {
              event.stopPropagation()
              beginDrag('resize-end', event)
            }}
            onKeyDown={(event) => {
              event.stopPropagation()
              onResizeEndKeyDown(event)
            }}
            className="absolute right-0 top-1/2 h-[24px] w-[10px] translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full bg-inv-ink/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          />
        </div>
      </div>
      <div aria-hidden="true" className="flex justify-between text-nano text-ink-dim">
        <span>{formatMinutes(windowStart)}</span>
        <span>{formatMinutes(windowEnd)}</span>
      </div>
      {pinned && (
        <p id={DURATION_DRAG_MESSAGE_ID} role="status" className="text-note font-medium text-ink">
          Capped — a neighbouring activity (or the end of the day) starts right there.
        </p>
      )}
    </div>
  )
}

/** A time badge anchored above its own edge of the track, with a short connecting tick down to it. */
function EdgeTimeLabel({ leftPct, minutes }: { leftPct: number; minutes: number }) {
  return (
    <div
      aria-hidden="true"
      className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
      style={{ left: `${leftPct}%` }}
    >
      <span className="whitespace-nowrap rounded-full border border-line bg-surface-2 px-sm py-px text-nano font-extrabold text-ink">
        {formatMinutes(minutes)}
      </span>
      <span className="mt-px h-[6px] w-px bg-line" />
    </div>
  )
}
