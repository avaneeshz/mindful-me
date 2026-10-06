import { useEffect, useState } from 'react'
import { Pencil, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { TileDto } from '@/api/tiles'
import { ActivityEditView } from '@/components/editor/ActivityEditView'
import { AddNameRow, EditableActivityList, RowIconButton } from '@/components/editor/ActivityRows'
import { HiddenInSettingsLink } from '@/components/settings/HiddenItemsPanel'
import { TileForm } from '@/components/editor/TileForm'
import { ColorPicker } from '@/components/ui/ColorPicker'
import { childrenOf, isTopLevelNameTaken, moveInOrder } from '@/domain/pickerHierarchy'
import { colorTintStyle } from '@/components/ui/colorStyles'
import { resolveIcon } from '@/lib/iconRegistry'
import type { UseActivityHierarchyResult } from '@/state/useActivityHierarchy'
import type { UseTilesResult } from '@/state/useTiles'

/**
 * The content of a tile's edit popover: rename the tile and its icon, and
 * manage its activities. A row's pencil drills into that activity's own
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
          <div className="flex min-w-0 items-center gap-sm">
            <span
              className="flex size-chip shrink-0 items-center justify-center rounded-sm bg-surface-2 text-ink"
              style={colorTintStyle(tile.color ?? null, { border: false })}
            >
              <Icon aria-hidden="true" className="size-[16px]" />
            </span>
            <h3 className="truncate text-btn font-semibold text-ink">{tile.label}</h3>
          </div>
          <div className="flex shrink-0 items-center">
            <RowIconButton label={`Rename ${tile.label}`} onClick={() => setRenaming(true)}>
              <Pencil aria-hidden="true" className="size-[14px]" />
            </RowIconButton>
            <RowIconButton label="Close" onClick={onClose}>
              <X aria-hidden="true" className="size-[16px]" />
            </RowIconButton>
          </div>
        </div>
      )}

      <section aria-label="Colour" className="flex flex-col gap-sm">
        <h4 className="text-caption font-bold uppercase tracking-tag text-ink-dim">Colour</h4>
        <ColorPicker
          value={tile.color ?? null}
          onChange={(color) => tiles.setTileColor(tile.id, color)}
          inheritedLabel="No colour"
        />
      </section>

      <section aria-label="Activities" className="flex flex-col gap-sm">
        <h4 className="text-caption font-bold uppercase tracking-tag text-ink-dim">Activities</h4>
        <EditableActivityList
          rows={visible}
          emptyText="No activities yet. Add the first one below."
          subtitle={(row) =>
            childrenOf(rows, row.id, tile.id)
              .visible.map((c) => c.name)
              .join(' · ')
          }
          onOpen={setOpenActivityId}
          onMove={(id, direction) => {
            const next = moveInOrder(
              visible.map((r) => r.id),
              id,
              direction,
            )
            if (next) activities.reorder(next)
          }}
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
