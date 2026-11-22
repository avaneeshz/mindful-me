import { useEffect, useState } from 'react'
import { Pencil, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { TileDto } from '@/api/tiles'
import { ActivityEditView } from '@/components/editor/ActivityEditView'
import { AddNameRow, RowIconButton } from '@/components/editor/ActivityRows'
import { ActivityCardGrid } from '@/components/editor/ActivityCardGrid'
import { HiddenInSettingsLink } from '@/components/settings/HiddenItemsPanel'
import { TileForm } from '@/components/editor/TileForm'
import { ColorPicker } from '@/components/ui/ColorPicker'
import { effectiveActivityColor } from '@/domain/colors'
import { childrenOf, isTopLevelNameTaken } from '@/domain/pickerHierarchy'
import { colorTintStyle } from '@/components/ui/colorStyles'
import { cn } from '@/lib/utils'
import { resolveIcon } from '@/lib/iconRegistry'
import type { UseActivityHierarchyResult } from '@/state/useActivityHierarchy'
import type { UseTilesResult } from '@/state/useTiles'

/**
 * The content of a tile's edit window: rename the tile and pick its colour (the
 * only two tile-level edits), then its activities as draggable square cards. A row's pencil drills into that activity's own
 * editor (`ActivityEditView`) inside the same popover, with a back button.
 */
export function TileEditPanel({
  tile,
  tiles,
  activities,
  onClose,
}: {
  tile: TileDto
  tiles: Pick<UseTilesResult, 'renameTile' | 'setTileColor' | 'tiles'>
  activities: UseActivityHierarchyResult
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [openActivityId, setOpenActivityId] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [editingColour, setEditingColour] = useState(false)
  const rows = activities.activities
  const openActivity = openActivityId ? rows.find((a) => a.id === openActivityId) ?? null : null

  // The open activity vanished (deleted elsewhere): fall back to the tile.
  useEffect(() => {
    if (openActivityId && !openActivity) setOpenActivityId(null)
  }, [openActivityId, openActivity])

  if (openActivity) {
    const parent = openActivity.parentId ? rows.find((a) => a.id === openActivity.parentId) : null
    return (
      <ActivityEditView
        key={openActivity.id}
        activity={openActivity}
        tileId={tile.id}
        backLabel={parent ? parent.name : tile.label}
        tileLabel={tile.label}
        tiles={tiles.tiles}
        activities={activities}
        onBack={() => setOpenActivityId(parent ? parent.id : null)}
        onOpen={setOpenActivityId}
        onClose={onClose}
        onManageOptions={() => navigate('/settings#options')}
      />
    )
  }

  const Icon = resolveIcon(tile.iconKey)
  const { visible, hidden } = childrenOf(rows, null, tile.id)
  return (
    <>
      {renaming ? (
        <TileForm
          initialLabel={tile.label}
          initialIcon={tile.iconKey}
          onSave={(label, iconKey) => {
            tiles.renameTile(tile.id, label, iconKey)
            setRenaming(false)
          }}
          onCancel={() => setRenaming(false)}
        />
      ) : (
        <div className="flex items-center justify-between gap-sm">
          <div className="flex min-w-0 items-center gap-xs">
            <span
              className="mr-xs flex size-chip shrink-0 items-center justify-center rounded-sm bg-surface-2 text-ink"
              style={colorTintStyle(tile.color ?? null, { border: false })}
            >
              <Icon aria-hidden="true" className="size-[16px]" />
            </span>
            <h3 className="truncate text-btn font-semibold text-ink">{tile.label}</h3>
            <RowIconButton label={`Rename ${tile.label}`} onClick={() => setRenaming(true)}>
              <Pencil aria-hidden="true" className="size-[14px]" />
            </RowIconButton>
            <span
              role="img"
              aria-label={tile.color ? `Colour ${tile.color.toUpperCase()}` : 'No colour'}
              className={cn('ml-sm size-[20px] shrink-0 rounded-full border border-line', !tile.color && 'bg-surface-2')}
              style={tile.color ? { background: tile.color } : undefined}
            />
            <RowIconButton label="Edit colour" onClick={() => setEditingColour((v) => !v)} expanded={editingColour}>
              <Pencil aria-hidden="true" className="size-[14px]" />
            </RowIconButton>
          </div>
          <RowIconButton label="Close" onClick={onClose}>
            <X aria-hidden="true" className="size-[16px]" />
          </RowIconButton>
        </div>
      )}

      {editingColour && (
        <section aria-label="Colour">
          <ColorPicker
            value={tile.color ?? null}
            onChange={(color) => tiles.setTileColor(tile.id, color)}
            inheritedLabel="No colour"
          />
        </section>
      )}

      <section aria-label="Activities" className="flex flex-col gap-sm">
        <h4 className="text-caption font-bold uppercase tracking-tag text-ink-dim">Activities</h4>
        <ActivityCardGrid
          rows={visible}
          emptyText="No activities yet. Add the first one below."
          colorFor={(row) => effectiveActivityColor(rows, tiles.tiles, row.id)}
          onOpen={setOpenActivityId}
          onReorder={activities.reorder}
          onHide={activities.hideActivity}
        />
        <AddNameRow
          label="New activity name"
          placeholder="New activity"
          validate={(name) =>
            isTopLevelNameTaken(rows, name) ? `You already have a top-level activity named “${name}”. Pick a different name.` : null
          }
          onAdd={(name) => activities.addActivity({ name, tileId: tile.id })}
        />
        <HiddenInSettingsLink count={hidden.length} noun="activity" />
      </section>
    </>
  )
}
