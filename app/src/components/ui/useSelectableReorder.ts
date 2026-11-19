import { useEffect, useRef, useState } from 'react'
import type { HeaderButtonLayout } from '@/domain/headerButtons'
import { usePointerReorder, type PointerReorder } from '@/components/ui/usePointerReorder'

/** Put this attribute on every reorderable item: a press on one is handled by that item, anything else clears the selection. */
export const REORDER_ITEM_ATTR = 'data-reorder-item'

export interface SelectableReorder extends PointerReorder {
  selectedIds: string[]
  selectedIdsRef: { readonly current: string[] }
  isSelected: (id: string) => boolean
  toggleSelected: (id: string) => void
  /** True when the item should wobble: selected, and nothing is mid-drag. */
  wobbles: (id: string) => boolean
}

/**
 * The edit-mode interaction every reorderable surface shares — header buttons,
 * state tiles and activities: tap an item to select it (it wobbles, "I can be
 * moved"), tap more in the same lane to add them, drag any selected item to
 * carry the whole selection. The selection stays through the drag and after
 * the drop, and clears on a press outside the items, on Escape, and when edit
 * mode ends.
 *
 * Every drag has a tap equivalent in the caller (a category picker, move
 * up / down) — dragging is the fast way, never the only one.
 */
export function useSelectableReorder({
  lanes,
  enabled,
  onCommit,
}: {
  lanes: HeaderButtonLayout
  enabled: boolean
  onCommit: (layout: HeaderButtonLayout, selectedIds: string[]) => void
}): SelectableReorder {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const selectedIdsRef = useRef(selectedIds)
  selectedIdsRef.current = selectedIds
  const lanesRef = useRef(lanes)
  lanesRef.current = lanes

  const laneOf = (id: string) => lanesRef.current.find((lane) => lane.buttonIds.includes(id))?.groupId

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      if (current.length === 0) return [id]
      // One lane at a time: picking from another lane starts a new selection.
      if (laneOf(current[0]!) !== laneOf(id)) return [id]
      return current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    })
  }

  const reorder = usePointerReorder({
    lanes,
    enabled,
    selectedIds,
    onCommit: (layout) => onCommit(layout, selectedIdsRef.current),
    onTap: toggleSelected,
    onDragStart: (id) => setSelectedIds([id]),
  })

  useEffect(() => {
    if (!enabled) setSelectedIds([])
  }, [enabled])

  const hasSelection = selectedIds.length > 0
  useEffect(() => {
    if (!hasSelection) return
    function onPointerDown(event: PointerEvent) {
      if ((event.target as Element | null)?.closest(`[${REORDER_ITEM_ATTR}]`)) return
      setSelectedIds([])
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setSelectedIds([])
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [hasSelection])

  return {
    ...reorder,
    selectedIds,
    selectedIdsRef,
    isSelected: (id) => selectedIds.includes(id),
    toggleSelected,
    wobbles: (id) => selectedIds.includes(id) && reorder.draggingIds.length === 0,
  }
}
