import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { moveId } from '@/domain/headerButtons'

/** Movement (px) before a press becomes a drag. Below it, the press is a tap. */
const DRAG_THRESHOLD = 6

interface DragState {
  id: string
  pointerId: number
  startX: number
  startY: number
  /** Pointer offset inside the item at grab time, so it doesn't jump under the finger. */
  grabX: number
  grabY: number
  dragging: boolean
}

export interface PointerReorder {
  /** The order to render: the live preview while dragging, `ids` otherwise. */
  order: string[]
  draggingId: string | null
  itemProps: (id: string) => {
    ref: (el: HTMLElement | null) => void
    onPointerDown: (event: PointerEvent<HTMLElement>) => void
    style: CSSProperties
    'data-dragging'?: ''
  }
}

/**
 * Drag-to-reorder for one wrapping row of items, driven by Pointer Events so
 * the same code handles a mouse on a PC and a finger on an iPad. A press that
 * never moves past `DRAG_THRESHOLD` is reported as a tap (`onTap`) instead.
 * Presses that start on an element marked `data-reorder-ignore` (the edit /
 * remove controls) are left alone.
 */
export function usePointerReorder({
  ids,
  enabled,
  onCommit,
  onTap,
}: {
  ids: readonly string[]
  enabled: boolean
  onCommit: (order: string[]) => void
  onTap?: (id: string) => void
}): PointerReorder {
  const [preview, setPreview] = useState<string[] | null>(null)
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null)
  const stateRef = useRef<DragState | null>(null)
  const nodes = useRef(new Map<string, HTMLElement>())
  const previewRef = useRef<string[] | null>(null)
  previewRef.current = preview
  const dragRef = useRef(drag)
  dragRef.current = drag

  const order = preview ?? [...ids]

  const finish = useCallback(
    (commit: boolean) => {
      const s = stateRef.current
      stateRef.current = null
      const finalOrder = previewRef.current
      setPreview(null)
      setDrag(null)
      if (!s) return
      if (!s.dragging) {
        onTap?.(s.id)
        return
      }
      if (commit && finalOrder && finalOrder.join() !== ids.join()) onCommit(finalOrder)
    },
    [ids, onCommit, onTap],
  )

  useEffect(() => {
    if (!enabled) {
      stateRef.current = null
      setPreview(null)
      setDrag(null)
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
        setPreview([...ids])
      }
      event.preventDefault()

      // Which item is under the pointer? Its slot is where the dragged one goes.
      const current = previewRef.current ?? [...ids]
      for (const [otherId, el] of nodes.current) {
        if (otherId === s.id) continue
        const r = el.getBoundingClientRect()
        if (event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom) {
          const next = moveId(current, s.id, current.indexOf(otherId))
          if (next.join() !== current.join()) setPreview(next)
          break
        }
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
  }, [ids, finish])

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

  return { order, draggingId: drag?.id ?? null, itemProps }
}
