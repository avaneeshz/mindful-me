import { useState } from 'react'
import { Loader2, Pencil, Plus, X } from 'lucide-react'
import { EditOverlay } from '@/components/editor/EditOverlay'
import { TileEditPanel } from '@/components/editor/TileEditPanel'
import { TileForm } from '@/components/editor/TileForm'
import { resolveIcon } from '@/lib/iconRegistry'
import { colorTintStyle } from '@/components/ui/colorStyles'
import { usePickerData } from '@/state/PickerDataContext'
import { HiddenInSettingsLink } from '@/components/settings/HiddenItemsPanel'
import type { TileDto } from '@/api/tiles'
import { cn } from '@/lib/utils'

const NEW_TILE = 'new'

/**
 * The tile row while Edit mode is on. Same grid and tile size as the
 * everyday row, but each tile carries a pencil and a cross, and opening one
 * shows its editor as a popover (sheet on a phone) instead of the old
 * full-screen dialog. Nothing about logging happens here: tapping a tile
 * edits it. The cross hides a tile; hidden tiles are restored from
 * Settings → Hidden items.
 * Works entirely through `usePickerData` (the hooks), never the API.
 */
export function EditableTileRow() {
  const { tiles: tilesResult, activities } = usePickerData()
  const [openId, setOpenId] = useState<string | null>(null)

  const ordered = [...tilesResult.tiles].sort((a, b) => a.sortOrder - b.sortOrder)
  const visible = ordered.filter((t) => !t.hidden)
  const hidden = ordered.filter((t) => t.hidden)

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

      <div className="tile-row">
        {visible.map((tile) => (
          <EditTile
            key={tile.id}
            tile={tile}
            open={openId === tile.id}
            onOpenChange={(next) => setOpenId(next ? tile.id : null)}
            onHide={() => tilesResult.hideTile(tile.id)}
          >
            <TileEditPanel tile={tile} tiles={tilesResult} activities={activities} onClose={() => setOpenId(null)} />
          </EditTile>
        ))}

        <EditOverlay
          open={openId === NEW_TILE}
          onOpenChange={(next) => setOpenId(next ? NEW_TILE : null)}
          label="Add a tile"
          anchor={
            <div className="relative min-w-0">
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
  open,
  onOpenChange,
  onHide,
  children,
}: {
  tile: TileDto
  open: boolean
  onOpenChange: (open: boolean) => void
  onHide: () => void
  children: React.ReactNode
}) {
  const Icon = resolveIcon(tile.iconKey)
  const badge =
    'absolute top-xs flex size-[24px] items-center justify-center rounded-full border border-line bg-surface text-ink-dim transition-colors hover:bg-inv-bg hover:text-inv-ink'
  return (
    <EditOverlay
      open={open}
      onOpenChange={onOpenChange}
      label={`Edit ${tile.label}`}
      anchor={
        <div className="relative min-w-0">
          <button
            type="button"
            aria-label={`Edit ${tile.label}`}
            aria-expanded={open}
            onClick={() => onOpenChange(true)}
            className={cn(
              'relative flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-sm overflow-hidden',
              'rounded-lg border bg-bg p-sm transition-colors hover:border-ink',
              open ? 'border-ink shadow-[0_0_0_1px_var(--ink)]' : 'border-dashed border-line',
            )}
            style={colorTintStyle(tile.color, { border: !open })}
          >
            <Icon aria-hidden="true" className="size-[20px] shrink-0 text-ink" />
            <span aria-hidden="true" className="w-full line-clamp-2 px-xs text-center text-micro font-bold leading-tight text-ink">
              {tile.label}
            </span>
          </button>
          <button type="button" aria-label={`Edit ${tile.label} tile`} onClick={() => onOpenChange(true)} className={cn(badge, 'left-xs')}>
            <Pencil aria-hidden="true" className="size-[12px]" />
          </button>
          <button type="button" aria-label={`Hide ${tile.label}`} onClick={onHide} className={cn(badge, 'right-xs')}>
            <X aria-hidden="true" className="size-[12px]" />
          </button>
        </div>
      }
    >
      {children}
    </EditOverlay>
  )
}
