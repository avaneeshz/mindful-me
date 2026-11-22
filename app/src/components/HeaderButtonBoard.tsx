import { useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AddCategoryControl, AddHeaderButtonChip, CategoryHeading, EditModeControls } from '@/components/HeaderButtonEditor'
import { layoutFromRows, type HeaderButtonConfig, type HeaderButtonGroup, type HeaderButtonLayout } from '@/domain/headerButtons'
import type { DragGhost } from '@/components/ui/usePointerReorder'
import { REORDER_ITEM_ATTR, useSelectableReorder } from '@/components/ui/useSelectableReorder'
import { cn } from '@/lib/utils'

/**
 * The categories and their buttons. Outside Edit mode it just renders them.
 * In Edit mode each button is locked (a tap shows "Finish editing to log"
 * instead of logging) and can be dragged — mouse on PC, finger on iPad — to a
 * new spot, in its own category or any other. The same moves are available by
 * tapping: a button's Edit form has a Category picker, and each category
 * heading has move up / down.
 */
export function HeaderButtonBoard({
  rows,
  groups,
  editMode,
  onArrange,
  onEdit,
  onDelete,
  onAddButton,
  onAddGroup,
  onRenameGroup,
  onDeleteGroup,
  onMoveGroup,
  renderButton,
}: {
  rows: { group: HeaderButtonGroup; buttons: HeaderButtonConfig[] }[]
  groups: HeaderButtonGroup[]
  editMode: boolean
  onArrange: (layout: HeaderButtonLayout) => void
  onEdit: (button: HeaderButtonConfig) => void
  onDelete: (button: HeaderButtonConfig) => void
  onAddButton: (group: HeaderButtonGroup) => void
  onAddGroup: (name: string) => void
  onRenameGroup: (id: string, name: string) => void
  onDeleteGroup: (id: string) => void
  onMoveGroup: (group: HeaderButtonGroup, direction: -1 | 1) => void
  renderButton: (button: HeaderButtonConfig) => ReactNode
}) {
  const idBase = useId()
  const byId = new Map(rows.flatMap((row) => row.buttons).map((b) => [b.id, b]))
  // Tapping a button selects it; tapping more buttons in the SAME category adds
  // them (tap a selected one again to drop it from the selection). Dragging any
  // selected button carries the whole selection, to any category. The selection
  // stays through the drag and after the drop, so it can be found again among
  // dozens, and clears when you press anywhere outside the buttons, press
  // Escape, or leave Edit mode. (All of that lives in `useSelectableReorder`.)
  const { lanes, draggingId, draggingIds, ghost, itemProps, laneRef, isSelected, wobbles } = useSelectableReorder({
    lanes: layoutFromRows(rows),
    enabled: editMode,
    onCommit: (layout, selectedIds) => {
      onArrange(layout)
      // The drop may have moved it out of view; bring it back into view.
      const id = selectedIds[0]
      if (id) {
        requestAnimationFrame(() => {
          document.querySelector(`[data-header-button-id="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        })
      }
    },
  })

  return (
    <div className="flex flex-col">
      {rows.map((row, index) => {
        const ids = lanes.find((lane) => lane.groupId === row.group.id)?.buttonIds ?? []
        if (ids.length === 0 && !editMode) return null
        const headingId = `${idBase}-${row.group.id}`
        return (
          <section
            key={row.group.id}
            aria-labelledby={headingId}
            className="flex flex-col gap-sm border-t border-line-soft py-sm first:border-t-0 first:pt-0 last:pb-0"
          >
            <CategoryHeading
              group={row.group}
              groups={groups}
              buttonCount={row.buttons.length}
              index={index}
              count={rows.length}
              editMode={editMode}
              headingId={headingId}
              onRename={(name) => onRenameGroup(row.group.id, name)}
              onMove={(direction) => onMoveGroup(row.group, direction)}
              onDelete={() => onDeleteGroup(row.group.id)}
            />
            <div
              ref={laneRef(row.group.id)}
              role="group"
              aria-labelledby={headingId}
              className={cn('flex flex-wrap items-center gap-sm', editMode && 'min-h-[40px]')}
            >
              {ids.map((id) => {
                const button = byId.get(id)
                if (!button) return null
                if (!editMode) {
                  return (
                    <span key={id} className="relative">
                      {renderButton(button)}
                    </span>
                  )
                }
                const props = itemProps(id)
                const selected = isSelected(id)
                // While several travel together their own slots are placeholders showing where they'll land.
                const inGroupDrag = draggingIds.length > 1 && draggingIds.includes(id)
                return (
                  <span
                    key={id}
                    ref={props.ref}
                    onPointerDown={props.onPointerDown}
                    style={props.style}
                    data-dragging={props['data-dragging']}
                    data-header-button-id={id}
                    {...{ [REORDER_ITEM_ATTR]: '' }}
                    data-selected={selected ? '' : undefined}
                    aria-roledescription="draggable button"
                    aria-current={selected ? 'true' : undefined}
                    className={cn(
                      'relative select-none rounded-full transition-opacity duration-200',
                      selected && 'shadow-elevation-2',
                      inGroupDrag && 'opacity-40',
                      draggingId === id && 'shadow-elevation-2',
                    )}
                  >
                    {/* The wobble sits on this inner span, not the draggable one, so it
                        never fights the drag's own transform. Only selected buttons wobble,
                        and they hold still while being dragged. */}
                    <span
                      inert
                      className={cn(
                        'pointer-events-none block rounded-full transition-transform duration-200',
                        inGroupDrag && 'scale-95',
                        wobbles(id) && 'animate-jiggle',
                        // A selected button is the theme's solid "invert" pair (the same fill as the Done pill).
                        selected && '[&_*]:!text-inv-ink [&_button]:!border-inv-bg [&_button]:!bg-inv-bg',
                      )}
                      style={{ animationDelay: `${-(index % 4) * 0.07 - (ids.indexOf(id) % 3) * 0.05}s` }}
                    >
                      {renderButton(button)}
                    </span>
                    <span data-reorder-ignore="">
                      <EditModeControls button={button} onEdit={() => onEdit(button)} onDelete={() => onDelete(button)} />
                    </span>
                  </span>
                )
              })}
              {editMode && (
                <span data-reorder-ignore="">
                  <AddHeaderButtonChip onClick={() => onAddButton(row.group)} />
                </span>
              )}
            </div>
          </section>
        )
      })}
      {editMode && (
        <div className="pt-sm" data-reorder-ignore="">
          <AddCategoryControl groups={groups} onAdd={onAddGroup} />
        </div>
      )}
      {ghost && typeof document !== 'undefined' && createPortal(<DragStack ghost={ghost} label={byId.get(ghost.primaryId)?.label ?? ''} />, document.body)}
    </div>
  )
}

/**
 * What follows the pointer while several buttons travel together: the pressed
 * button's own label on top, two layers fanned out behind it, and a count.
 * Purely visual — the buttons' real slots (shown faded) are where they'll land.
 */
function DragStack({ ghost, label }: { ghost: DragGhost; label: string }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-[60]"
      style={{ transform: `translate3d(${ghost.x - ghost.grabX}px, ${ghost.y - ghost.grabY}px, 0)` }}
    >
      <div className="relative">
        {ghost.ids.length > 2 && (
          <span className="absolute inset-0 translate-x-[12px] translate-y-[12px] animate-stack-fan rounded-full border border-inv-bg bg-inv-bg/60" />
        )}
        <span className="absolute inset-0 translate-x-[6px] translate-y-[6px] animate-stack-fan rounded-full border border-inv-bg bg-inv-bg/80" />
        <span className="relative flex animate-stack-pop items-center whitespace-nowrap rounded-full border border-inv-bg bg-inv-bg px-md py-[7px] text-body font-semibold text-inv-ink shadow-elevation-2">
          {label}
          <span className="absolute -right-[8px] -top-[8px] flex size-[22px] items-center justify-center rounded-full border-2 border-bg bg-surface text-nano font-bold text-ink shadow-elevation-1">
            {ghost.ids.length}
          </span>
        </span>
      </div>
    </div>
  )
}
