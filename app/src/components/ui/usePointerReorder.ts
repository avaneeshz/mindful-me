import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { layoutAfterMoveMany, layoutsEqual, type HeaderButtonLayout } from '@/domain/headerButtons'

/** Movement (px) before a press becomes a drag. Below it, the press is a tap. */
const DRAG_THRESHOLD = 6

interface DragState {
  id: string
  /** Everything that moves with this press: the whole selection when the pressed button is part of a multi-selection, else just the button. */
  ids: string[]
  pointerId: number
  startX: number
  startY: number
  /** Pointer offset inside the item at grab time, so it doesn't jump under the finger. */
  grabX: number
  grabY: number
  dragging: boolean
}

/** Where the floating "stack" of a multi-drag is: the pointer, and where inside the pressed button it grabbed. */
export interface DragGhost {
  ids: string[]
  primaryId: string
  x: number
  y: number
  grabX: number
  grabY: number
}

export interface PointerReorder {
  /** The layout to render: the live preview while dragging, `lanes` otherwise. */
  lanes: HeaderButtonLayout
  /** The one button being dragged; null while a multi-selection is being dragged (see `draggingIds`). */
  draggingId: string | null
  /** Every button being dragged right now (empty when nothing is). */
  draggingIds: string[]
  /** Set only while MORE THAN ONE button is dragged: the stack that follows the pointer. */
  ghost: DragGhost | null
  itemProps: (id: string) => {
    ref: (el: HTMLElement | null) => void
    onPointerDown: (event: PointerEvent<HTMLElement>) => void
    style: CSSProperties
    'data-dragging'?: ''
  }
  /** Ref callback for a lane's container, so an empty (or gap-between-items) spot still accepts a drop. */
  laneRef: (laneId: string) => (el: HTMLElement | null) => void
}

/**
 * Drag-to-reorder across several wrapping rows ("lanes") of items, driven by
 * Pointer Events so the same code handles a mouse on a PC and a finger on an
 * iPad. An item dropped on another item takes its slot, in whichever lane that
 * item is in; dropped on an empty part of a lane it goes to that lane's end.
 * A press that never moves past `DRAG_THRESHOLD` is reported as a tap
 * (`onTap`) instead. Presses that start on an element marked
 * `data-reorder-ignore` (the edit / delete controls) are left alone.
 *
 * Several buttons can travel together: pressing and dragging a button that is
 * in `selectedIds` (when more than one is selected) moves the whole selection,
 * keeping their order, and they land side by side. Pressing and dragging a
 * button that is NOT selected selects just it first (`onDragStart`).
 *
 * Dragging is the fast way, never the only way: every move it can make is also
 * offered as a tap ("Move to…") by the caller.
 */
export function usePointerReorder({
  lanes,
  enabled,
  selectedIds = [],
  onCommit,
  onTap,
  onDragStart,
}: {
  lanes: HeaderButtonLayout
  enabled: boolean
  selectedIds?: readonly string[]
  onCommit: (lanes: HeaderButtonLayout) => void
  onTap?: (id: string) => void
  /** A drag begins on a button that wasn't selected: the caller makes it the selection. */
  onDragStart?: (id: string) => void
}): PointerReorder {
  const [preview, setPreview] = useState<HeaderButtonLayout | null>(null)
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null)
  const [ghost, setGhost] = useState<DragGhost | null>(null)
  const [draggingIds, setDraggingIds] = useState<string[]>([])
  const selectedRef = useRef(selectedIds)
  selectedRef.current = selectedIds
  const onDragStartRef = useRef(onDragStart)
  onDragStartRef.current = onDragStart
  const stateRef = useRef<DragState | null>(null)
  const nodes = useRef(new Map<string, HTMLElement>())
  const laneNodes = useRef(new Map<string, HTMLElement>())
  const previewRef = useRef<HeaderButtonLayout | null>(null)
  previewRef.current = preview
  const dragRef = useRef(drag)
  dragRef.current = drag
  const lanesRef = useRef(lanes)
  lanesRef.current = lanes

  const finish = useCallback(
    (commit: boolean) => {
      const s = stateRef.current
      stateRef.current = null
      const finalLayout = previewRef.current
      setPreview(null)
      setDrag(null)
      setGhost(null)
      setDraggingIds([])
      if (!s) return
      if (!s.dragging) {
        onTap?.(s.id)
        return
      }
      if (commit && finalLayout && !layoutsEqual(finalLayout, lanesRef.current)) onCommit(finalLayout)
    },
    [onCommit, onTap],
  )

  useEffect(() => {
    if (!enabled) {
      stateRef.current = null
      setPreview(null)
      setDrag(null)
      setGhost(null)
      setDraggingIds([])
    }
  }, [enabled])

  useEffect(() => {
    function onMove(event: globalThis.PointerEvent) {
      const s = stateRef.current
      if (!s || event.pointerId !== s.pointerId) return
      const dx = event.clientX - s.startX
      const dy = event.clientY - s.startY
      if (!s.dragging) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
        s.dragging = true
        // The whole selection travels if the pressed button is part of a multi-selection;
        // otherwise only this button, and it becomes the selection.
        const selection = selectedRef.current
        if (selection.length > 1 && selection.includes(s.id)) {
          s.ids = [...selection]
        } else {
          s.ids = [s.id]
          if (!selection.includes(s.id) || selection.length !== 1) onDragStartRef.current?.(s.id)
        }
        setDraggingIds(s.ids)
        setPreview(lanesRef.current)
      }
      event.preventDefault()

      const current = previewRef.current ?? lanesRef.current
      const inside = (el: HTMLElement) => {
        const r = el.getBoundingClientRect()
        return event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom
      }

      // Which item is under the pointer? Its slot, in its lane, is where the dragged one goes.
      let next: HeaderButtonLayout | null = null
      for (const [otherId, el] of nodes.current) {
        if (s.ids.includes(otherId) || !inside(el)) continue
        const lane = current.find((entry) => entry.buttonIds.includes(otherId))
        if (lane) next = layoutAfterMoveMany(current, s.ids, lane.groupId, lane.buttonIds.indexOf(otherId))
        break
      }
      // Otherwise, over a lane's own empty space: the end of that lane.
      if (!next) {
        for (const [laneId, el] of laneNodes.current) {
          if (!inside(el)) continue
          const lane = current.find((entry) => entry.groupId === laneId)
          if (lane && !s.ids.every((id) => lane.buttonIds.includes(id))) next = layoutAfterMoveMany(current, s.ids, laneId)
          break
        }
      }
      if (next && !layoutsEqual(next, current)) setPreview(next)

      // Several buttons: a floating stack follows the pointer (the buttons themselves hold their new slots).
      if (s.ids.length > 1) {
        setGhost({ ids: s.ids, primaryId: s.id, x: event.clientX, y: event.clientY, grabX: s.grabX, grabY: s.grabY })
        return
      }

      // Follow the pointer: offset from where the item's own slot now sits.
      const el = nodes.current.get(s.id)
      if (el) {
        const prev = dragRef.current?.id === s.id ? dragRef.current : { x: 0, y: 0 }
        const r = el.getBoundingClientRect()
        const naturalLeft = r.left - prev.x
        const naturalTop = r.top - prev.y
        setDrag({ id: s.id, x: event.clientX - s.grabX - naturalLeft, y: event.clientY - s.grabY - naturalTop })
      }
    }
    function onUp(event: globalThis.PointerEvent) {
      if (stateRef.current?.pointerId === event.pointerId) finish(true)
    }
    function onCancel(event: globalThis.PointerEvent) {
      if (stateRef.current?.pointerId === event.pointerId) finish(false)
    }
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
  }, [finish])

  function itemProps(id: string) {
    const isDragging = drag?.id === id
    return {
      ref: (el: HTMLElement | null) => {
        if (el) nodes.current.set(id, el)
        else nodes.current.delete(id)
      },
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (!enabled || event.button !== 0) return
        if ((event.target as HTMLElement).closest('[data-reorder-ignore]')) return
        const r = event.currentTarget.getBoundingClientRect()
        stateRef.current = {
          id,
          ids: [id],
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          grabX: event.clientX - r.left,
          grabY: event.clientY - r.top,
          dragging: false,
        }
      },
      style: enabled
        ? {
            touchAction: 'none',
            cursor: isDragging ? 'grabbing' : 'grab',
            ...(isDragging ? { transform: `translate(${drag.x}px, ${drag.y}px)`, zIndex: 20 } : null),
          }
        : {},
      ...(isDragging ? { 'data-dragging': '' as const } : null),
    }
  }

  const laneRef = (laneId: string) => (el: HTMLElement | null) => {
    if (el) laneNodes.current.set(laneId, el)
    else laneNodes.current.delete(laneId)
  }

  return { lanes: preview ?? lanes, draggingId: drag?.id ?? null, draggingIds, ghost, itemProps, laneRef }
}
