import { useState } from 'react'
import { ChevronLeft, Pencil, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ActivityFieldsPanel } from '@/components/editor/ActivityFieldsPanel'
import { AddNameRow, EditableActivityList, RowIconButton } from '@/components/editor/ActivityRows'
import { HiddenInSettingsLink } from '@/components/settings/HiddenItemsPanel'
import { InlineNameForm } from '@/components/editor/InlineNameForm'
import { ColorPicker } from '@/components/ui/ColorPicker'
import { IconPicker } from '@/components/editor/IconPicker'
import { resolveIcon } from '@/lib/iconRegistry'
import { effectiveActivityColor } from '@/domain/colors'
import {
  childrenOf,
  isSiblingNameTaken,
  isTopLevelNameTaken,
  moveInOrder,
  type ActivityRow,
  type LiveTile,
} from '@/domain/pickerHierarchy'
import type { UseActivityFieldsResult } from '@/state/useActivityFields'
import type { UseActivityHierarchyResult } from '@/state/useActivityHierarchy'

/**
 * One activity's own editor, reached from the pencil on its row: rename it,
 * change its icon (built-in or uploaded),
 * manage its subtypes (children — each with its own pencil, so the same
 * screen serves every depth), and shape what is recorded when it is logged:
 * its own notes and multiple-select fields, with their options
 * (`ActivityFieldsPanel`).
 */
export function ActivityEditView({
  activity,
  tileId,
  backLabel,
  tileLabel,
  tiles,
  activities,
  activityFields,
  onBack,
  onOpen,
  onClose,
}: {
  activity: ActivityRow
  tileId: string
  /** Name of what "back" returns to: the parent activity, or the tile. */
  backLabel: string
  /** The tile's name — what an uncoloured top-level activity inherits from. */
  tileLabel: string
  tiles: readonly Pick<LiveTile, 'id' | 'color'>[]
  activities: UseActivityHierarchyResult
  activityFields: UseActivityFieldsResult
  onBack: () => void
  onOpen: (id: string) => void
  onClose: () => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [choosingIcon, setChoosingIcon] = useState(false)
  const ActivityIcon = resolveIcon(activity.iconKey)
  const rows = activities.activities
  const { visible, hidden } = childrenOf(rows, activity.id, tileId)
  const parent = activity.parentId ? rows.find((a) => a.id === activity.parentId) : null
  // What shows when this activity has no colour of its own.
  const inheritedColor = parent
    ? effectiveActivityColor(rows, tiles, parent.id)
    : (tiles.find((t) => t.id === tileId)?.color ?? null)
  const inheritedFrom = parent ? parent.name : tileLabel

  function rename(name: string) {
    const taken =
      activity.parentId === null
        ? isTopLevelNameTaken(rows, name, activity.id)
        : isSiblingNameTaken(rows, activity.parentId, name, activity.id)
    if (taken) {
      setRenameError(`You already have an activity named “${name}” here. Pick a different name.`)
      return
    }
    activities.renameActivity(activity.id, name)
    setRenaming(false)
    setRenameError(null)
  }

  return (
    <>
      <div className="flex items-center justify-between gap-md">
        <Button variant="outline" size="inline" className="max-w-[70%] gap-xs px-sm py-xs text-caption" onClick={onBack}>
          <ChevronLeft aria-hidden="true" className="size-[14px] shrink-0" />
          <span className="truncate">{backLabel}</span>
        </Button>
        <RowIconButton label="Close" onClick={onClose}>
          <X aria-hidden="true" className="size-[16px]" />
        </RowIconButton>
      </div>

      {renaming ? (
        <InlineNameForm
          initial={activity.name}
          error={renameError}
          onSave={rename}
          onCancel={() => {
            setRenaming(false)
            setRenameError(null)
          }}
        />
      ) : (
        <div className="flex items-center justify-between gap-sm">
          <h3 className="min-w-0 truncate text-btn font-semibold text-ink">{activity.name}</h3>
          <RowIconButton label={`Rename ${activity.name}`} onClick={() => setRenaming(true)}>
            <Pencil aria-hidden="true" className="size-[14px]" />
          </RowIconButton>
        </div>
      )}

      <section aria-label="Icon" className="flex flex-col gap-sm">
        <div className="flex items-center justify-between gap-sm">
          <h4 className="text-caption font-bold uppercase tracking-tag text-ink-dim">Icon</h4>
          <div className="flex items-center gap-sm">
            <span className="flex size-chip items-center justify-center rounded-sm bg-surface-2 text-ink">
              <ActivityIcon aria-hidden="true" className="size-[16px]" />
            </span>
            <Button
              variant="outline"
              size="inline"
              className="px-sm py-xs text-caption"
              aria-expanded={choosingIcon}
              onClick={() => setChoosingIcon((v) => !v)}
            >
              {choosingIcon ? 'Done' : 'Change'}
            </Button>
          </div>
        </div>
        {choosingIcon && (
          <IconPicker value={activity.iconKey} onChange={(iconKey) => activities.setActivityIcon(activity.id, iconKey)} />
        )}
      </section>

      <section aria-label="Colour" className="flex flex-col gap-sm">
        <h4 className="text-caption font-bold uppercase tracking-tag text-ink-dim">Colour</h4>
        <ColorPicker
          value={activity.color ?? null}
          onChange={(color) => activities.setActivityColor(activity.id, color)}
          inheritedColor={inheritedColor}
          inheritedLabel={inheritedColor ? `Same as ${inheritedFrom}` : 'No colour'}
        />
      </section>

      <section aria-label="Subtypes" className="flex flex-col gap-sm">
        <h4 className="text-caption font-bold uppercase tracking-tag text-ink-dim">Subtypes</h4>
        <EditableActivityList
          rows={visible}
          emptyText="No subtypes yet. This activity is logged as it is. Add one below, for example Deep work under Focus work."
          subtitle={(row) =>
            childrenOf(rows, row.id, tileId)
              .visible.map((c) => c.name)
              .join(' · ')
          }
          colorFor={(row) => effectiveActivityColor(rows, tiles, row.id)}
          onOpen={onOpen}
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
          label="New subtype name"
          placeholder="New subtype"
          validate={(name) =>
            isSiblingNameTaken(rows, activity.id, name) ? `“${name}” already exists under ${activity.name}.` : null
          }
          onAdd={(name) => activities.addActivity({ name, parentId: activity.id })}
        />
        <HiddenInSettingsLink count={hidden.length} noun="option" />
      </section>

      <ActivityFieldsPanel activity={activity} rows={rows} data={activityFields} onOpenActivity={onOpen} />
    </>
  )
}
