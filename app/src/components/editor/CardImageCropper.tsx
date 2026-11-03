import { useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { CARD_IMAGE, clampCrop, sourceRect, type CropView } from '@/domain/reflectionCardImages'

const KEY_STEP = 0.1

/**
 * The framing step of a tile picture upload, like setting a profile photo:
 * a fixed 4:3 frame (the shape of the tile), with the chosen picture moved
 * and zoomed underneath it. Drag to move, slider or +/- to zoom, arrow keys
 * to nudge, so nothing depends on a pointer. What is inside the frame is
 * exactly what gets saved.
 */
export function CardImageCropper({
  url,
  width,
  height,
  view,
  onChange,
}: {
  url: string
  /** The picture's own pixel size. */
  width: number
  height: number
  view: CropView
  onChange: (view: CropView) => void
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; view: CropView } | null>(null)
  const [dragging, setDragging] = useState(false)

  const rect = sourceRect(width, height, view)
  const slackX = width - rect.w
  const slackY = height - rect.h

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, view }
    setDragging(true)
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const start = drag.current
    const frame = frameRef.current
    if (!start || !frame) return
    const box = frame.getBoundingClientRect()
    // Pointer travel -> picture pixels -> pan fraction. Dragging right shows more of the left.
    const srcDx = ((e.clientX - start.x) / box.width) * rect.w
    const srcDy = ((e.clientY - start.y) / box.height) * rect.h
    onChange(
      clampCrop({
        zoom: start.view.zoom,
        panX: slackX > 0 ? start.view.panX - srcDx / (slackX / 2) : 0,
        panY: slackY > 0 ? start.view.panY - srcDy / (slackY / 2) : 0,
      }),
    )
  }

  function endDrag() {
    drag.current = null
    setDragging(false)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-KEY_STEP, 0],
      ArrowRight: [KEY_STEP, 0],
      ArrowUp: [0, -KEY_STEP],
      ArrowDown: [0, KEY_STEP],
    }
    const move = moves[e.key]
    if (!move) return
    e.preventDefault()
    onChange(clampCrop({ ...view, panX: view.panX + move[0], panY: view.panY + move[1] }))
  }

  const setZoom = (zoom: number) => onChange(clampCrop({ ...view, zoom }))

  return (
    <div className="flex flex-col gap-md">
      <div
        ref={frameRef}
        tabIndex={0}
        role="group"
        aria-label="Picture frame. Drag the picture, or use the arrow keys, to choose what shows."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        style={{ aspectRatio: String(CARD_IMAGE.ratio) }}
        className={
          'relative w-full touch-none select-none overflow-hidden rounded-md border border-line bg-surface-2 ' +
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ' +
          (dragging ? 'cursor-grabbing' : 'cursor-grab')
        }
      >
        <img
          src={url}
          alt=""
          draggable={false}
          className="pointer-events-none absolute max-w-none"
          style={{
            width: `${(width / rect.w) * 100}%`,
            height: `${(height / rect.h) * 100}%`,
            left: `${(-rect.x / rect.w) * 100}%`,
            top: `${(-rect.y / rect.h) * 100}%`,
          }}
        />
        {/* Thirds guide so the framing is easy to judge. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 border border-white/60 [background:linear-gradient(to_right,transparent_33%,rgb(255_255_255/.35)_33%,rgb(255_255_255/.35)_calc(33%+1px),transparent_calc(33%+1px),transparent_66%,rgb(255_255_255/.35)_66%,rgb(255_255_255/.35)_calc(66%+1px),transparent_calc(66%+1px)),linear-gradient(to_bottom,transparent_33%,rgb(255_255_255/.35)_33%,rgb(255_255_255/.35)_calc(33%+1px),transparent_calc(33%+1px),transparent_66%,rgb(255_255_255/.35)_66%,rgb(255_255_255/.35)_calc(66%+1px),transparent_calc(66%+1px))]" />
      </div>

      <div className="flex items-center gap-sm">
        <button
          type="button"
          aria-label="Zoom out"
          disabled={view.zoom <= 1}
          onClick={() => setZoom(view.zoom - 0.25)}
          className="flex size-[32px] shrink-0 items-center justify-center rounded-full border border-line text-ink-dim transition-colors hover:border-ink hover:text-ink disabled:opacity-40"
        >
          <Minus aria-hidden="true" className="size-[14px]" />
        </button>
        <input
          type="range"
          aria-label="Zoom"
          min={1}
          max={CARD_IMAGE.maxZoom}
          step={0.01}
          value={view.zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="h-[32px] min-w-0 flex-1 accent-[var(--ink)]"
        />
        <button
          type="button"
          aria-label="Zoom in"
          disabled={view.zoom >= CARD_IMAGE.maxZoom}
          onClick={() => setZoom(view.zoom + 0.25)}
          className="flex size-[32px] shrink-0 items-center justify-center rounded-full border border-line text-ink-dim transition-colors hover:border-ink hover:text-ink disabled:opacity-40"
        >
          <Plus aria-hidden="true" className="size-[14px]" />
        </button>
      </div>
    </div>
  )
}
