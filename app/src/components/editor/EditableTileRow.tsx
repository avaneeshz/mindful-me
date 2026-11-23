import { useState } from 'react'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { EditOverlay } from '@/components/editor/EditOverlay'
import { TileEditPanel } from '@/components/editor/TileEditPanel'
import { TileForm } from '@/components/editor/TileForm'
import { resolveIcon } from '@/lib/iconRegistry'
import { colorTintStyle } from '@/components/ui/colorStyles'
import { usePickerData } from '@/state/PickerDataContext'
import { HiddenInSettingsLink } from '@/components/settings/HiddenItemsPanel'
import type { PointerReorder } from '@/components/ui/usePointerReorder'
import type { TileDto } from '@/api/tiles'
import { REORDER_ITEM_ATTR, useSelectableReorder } from '@/components/ui/useSelectableReorder'
import { cn } from '@/lib/utils'

const NEW_TILE = 'new'
const LANE = 'tiles'

/**
 * The tile row while Edit mode is on. Same grid and tile size as the
 * everyday row, but each tile carries a pencil (top-left) and a bin
 * (top-right). Tap a tile to select it (it wobbles, "I can be moved"), tap
 * more to add them, then drag to reorder — the same select-and-drag the header
 * buttons and State Tiles use. The pencil opens the tile's editor as a popover
 * (sheet on a phone), where Move earlier / later is the tap alternative to
 * dragging. Nothing about logging happens here. The bin hides a tile; hidden
 * tiles are restored from Settings → Hidden items.
 * Works entirely through `usePickerData` (the hooks), never the API.
 */
export function EditableTileRow() {
  const { tiles: tilesResult, activities, activityFields } = usePickerData()
  const [openId, setOpenId] = useState<string | null>(null)

  const ordered = [...tilesResult.tiles].sort((a, b) => a.sortOrder - b.sortOrder)
  const visibleAll = ordered.filter((t) => !t.hidden)
  const hidden = ordered.filter((t) => t.hidden)
  const byId = new Map(visibleAll.map((t) => [t.id, t]))

  const { lanes, draggingId, draggingIds, itemProps, laneRef, isSelected, wobbles, toggleSelected } = useSelectableReorder({
    lanes: [{ groupId: LANE, buttonIds: visibleAll.map((t) => t.id) }],
    enabled: true,
    onCommit: (layout) => tilesResult.reorder(layout[0]!.buttonIds),
  })
  const visible = (lanes[0]?.buttonIds ?? []).flatMap((id) => byId.get(id) ?? [])

  return (
    <div className="flex flex-col gap-lg">
      {tilesResult.status === 'loading' && (
        <p className="flex items-center gap-sm text-caption text-ink-dim">
          <Loader2 aria-hidden="true" className="size-[14px] animate-spin" />
          Loading your tiles…
        </p>
      )}
      {tilesResult.error && (
        <p role="alert" className="text-caption text-ink-dim">
          {tilesResult.error}
        </p>
      )}

      <div ref={laneRef(LANE)} className="tile-row">
        {visible.map((tile, index) => (
          <EditTile
            key={tile.id}
            tile={tile}
            index={index}
            open={openId === tile.id}
            onOpenChange={(next) => setOpenId(next ? tile.id : null)}
            onHide={() => tilesResult.hideTile(tile.id)}
            selected={isSelected(tile.id)}
            wobbling={wobbles(tile.id)}
            dragging={draggingId === tile.id}
            inGroupDrag={draggingIds.length > 1 && draggingIds.includes(tile.id)}
            drag={itemProps(tile.id)}
            onToggleSelected={() => toggleSelected(tile.id)}
          >
            <TileEditPanel tile={tile} tiles={tilesResult} activities={activities} activityFields={activityFields} onClose={() => setOpenId(null)} />
          </EditTile>
        ))}

        <EditOverlay
          open={openId === NEW_TILE}
          onOpenChange={(next) => setOpenId(next ? NEW_TILE : null)}
          label="Add a tile"
          anchor={
            <div className="relative min-w-0" data-reorder-ignore="">
              <button
                type="button"
                onClick={() => setOpenId(NEW_TILE)}
                className="flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-sm rounded-lg border border-dashed border-line bg-bg p-sm text-ink-dim transition-colors hover:border-ink hover:text-ink"
              >
                <Plus aria-hidden="true" className="size-[20px]" />
                <span className="text-micro font-bold">Add tile</span>
              </button>
            </div>
          }
        >
          <TileForm
            onSave={(label, iconKey) => {
              const created = tilesResult.addTile(label, iconKey)
              setOpenId(created.id)
            }}
            onCancel={() => setOpenId(null)}
          />
        </EditOverlay>
      </div>

      {visible.length === 0 && tilesResult.status === 'ready' && (
        <p className="text-caption text-ink-dim">No tiles yet. Add your first one.</p>
      )}

      <HiddenInSettingsLink count={hidden.length} noun="tile" />
    </div>
  )
}

function EditTile({
  tile,
  index,
  open,
  onOpenChange,
  onHide,
  selected,
  wobbling,
  dragging,
  inGroupDrag,
  drag,
  onToggleSelected,
  children,
}: {
  tile: TileDto
  index: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onHide: () => void
  selected: boolean
  wobbling: boolean
  dragging: boolean
  inGroupDrag: boolean
  drag: ReturnType<PointerReorder['itemProps']>
  onToggleSelected: () => void
  children: React.ReactNode
}) {
  const Icon = resolveIcon(tile.iconKey)
  const badge =
    'absolute top-xs z-10 flex size-[24px] items-center justify-center rounded-full border border-line bg-surface text-ink-dim transition-colors hover:bg-inv-bg hover:text-inv-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
  const active = open || selected
  return (
    <EditOverlay
      open={open}
      onOpenChange={onOpenChange}
      label={`Edit ${tile.label}`}
      variant="window"
      anchor={
        // The popover's anchor stays a plain, stable element; the drag wrapper (whose
        // ref the drag hook re-creates every render) sits inside it, never on it.
        <div className="relative min-w-0">
          <div
            ref={drag.ref}
            onPointerDown={drag.onPointerDown}
            style={drag.style}
            data-dragging={drag['data-dragging']}
            {...{ [REORDER_ITEM_ATTR]: '' }}
            aria-roledescription="draggable tile"
            className={cn(
              'relative min-w-0 select-none rounded-lg transition-opacity duration-200',
              selected && 'shadow-elevation-2',
              dragging && 'shadow-elevation-2',
              inGroupDrag && 'opacity-40',
            )}
          >
            {/* The wobble sits on this inner element, not the draggable one, so it never
                fights the drag's own transform. Only selected tiles wobble, and they hold
                still while being dragged. */}
            <div
              className={cn('rounded-lg transition-transform duration-200', wobbling && 'animate-jiggle')}
              style={{ animationDelay: `${-(index % 4) * 0.07 - (index % 3) * 0.05}s` }}
            >
              <button
                type="button"
                aria-label={`${tile.label} — select to move`}
                aria-pressed={selected}
                // A press (mouse or finger) is handled by the wrapper: a tap selects, a drag moves.
                // A click with no pointer (`detail` 0) is the keyboard, so Enter / Space select.
                onClick={(event) => {
                  if (event.detail === 0) onToggleSelected()
                }}
                className={cn(
                  'relative flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-sm overflow-hidden',
                  'rounded-lg border bg-bg p-sm transition-colors hover:border-ink',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                  active ? 'border-ink shadow-[0_0_0_1px_var(--ink)]' : 'border-dashed border-line',
                )}
                style={colorTintStyle(tile.color, { border: !active })}
              >
                <Icon aria-hidden="true" className="size-[20px] shrink-0 text-ink" />
                <span aria-hidden="true" className="w-full line-clamp-2 px-xs text-center text-micro font-bold leading-tight text-ink">
                  {tile.label}
                </span>
              </button>
            </div>
            <span data-reorder-ignore="">
              {/* Edit on the top-left corner, Delete on the top-right — the same two corners as the header buttons. */}
              <button type="button" aria-label={`Edit ${tile.label} tile`} aria-expanded={open} onClick={() => onOpenChange(true)} className={cn(badge, 'left-xs')}>
                <Pencil aria-hidden="true" className="size-[12px]" />
              </button>
              <button type="button" aria-label={`Hide ${tile.label}`} onClick={onHide} className={cn(badge, 'right-xs')}>
                <Trash2 aria-hidden="true" className="size-[12px]" />
              </button>
            </span>
          </div>
        </div>
      }
    >
      {children}
    </EditOverlay>
  )
}
