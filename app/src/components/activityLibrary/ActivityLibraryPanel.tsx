import { useEffect, useState } from 'react'
import { ActivityTree } from '@/components/activityLibrary/ActivityTree'
import { ParameterOptionsPanel } from '@/components/activityLibrary/ParameterOptionsPanel'
import { TileList } from '@/components/activityLibrary/TileList'
import { activityPathNames, collectSubtreeIds } from '@/domain/pickerHierarchy'
import { usePickerData } from '@/state/PickerDataContext'
import { useParameterOptions } from '@/state/useParameterOptions'

/**
 * Full user customization of the activity-picker hierarchy (PICKER-CUSTOM-1):
 * any number of tiles, any number of activities/sub-activities per tile to
 * arbitrary depth, and per-activity quality/chronic-symptom/protective-
 * response option lists.
 *
 * Originally its own route (`routes/ActivityLibraryPage.tsx`, reachable only
 * from the sidebar) — folded inline here per real user feedback: the user
 * expected the SAME "Edit" button that already reveals inline controls on
 * the quick-log header row (`HeaderBar`'s `EditModeToggle`) to also let them
 * edit tiles/activities, and never found the separate page. `SlotEditor`
 * renders this panel whenever that one Edit toggle is on (at the section
 * level, not inside `TileRow` — see `SlotEditor.tsx`'s own doc comment for
 * why that placement matters) — there is no second, disconnected entry point
 * any more. `TileList`/`ActivityTree`/`ParameterOptionsPanel` are reused
 * completely unchanged from that original page; only the surrounding shell
 * (page-level header, `/activity-library` route) was removed.
 *
 * Three-column layout on desktop/tablet (tiles -> activities -> options),
 * stacked into a single scrolling column on mobile — CLAUDE.md's "adapt
 * information hierarchy, don't just shrink" responsive rule: a phone never
 * sees three side-by-side panes, it sees one focused list at a time in the
 * order you'd naturally drill down.
 */
export function ActivityLibraryPanel() {
  // The SAME `useTiles`/`useActivityHierarchy` instance the live picker's
  // own `useLiveActivityCatalogSync` reads (`PickerDataContext`, mounted once
  // in `App.tsx`) — never a second, independent fetch. Editing here updates
  // that shared state directly, so the tile row above reflects it
  // immediately, no reload needed.
  const { tiles: tilesResult, activities: activitiesResult } = usePickerData()
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null)
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null)

  // Default to the first visible tile once tiles load, and again if the
  // currently-selected one disappears (hidden/deleted elsewhere).
  useEffect(() => {
    const visible = tilesResult.tiles.filter((t) => !t.hidden)
    if (visible.length === 0) {
      setSelectedTileId(null)
      return
    }
    if (!visible.some((t) => t.id === selectedTileId)) {
      setSelectedTileId(visible[0].id)
    }
  }, [tilesResult.tiles, selectedTileId])

  // Clear a selected activity that no longer exists (deleted, or its whole
  // subtree removed with its parent) or that no longer belongs to the
  // selected tile.
  useEffect(() => {
    if (selectedActivityId === null) return
    const stillExists = activitiesResult.activities.some((a) => a.id === selectedActivityId)
    if (!stillExists) {
      setSelectedActivityId(null)
      return
    }
    if (selectedTileId) {
      const path = activityPathNames(activitiesResult.activities, selectedActivityId)
      const topLevel = activitiesResult.activities.find((a) => a.name === path[0] && a.parentId === null)
      if (topLevel && topLevel.tileId !== selectedTileId) setSelectedActivityId(null)
    }
  }, [activitiesResult.activities, selectedActivityId, selectedTileId])

  const parameterOptions = useParameterOptions(selectedActivityId)
  const selectedActivity = activitiesResult.activities.find((a) => a.id === selectedActivityId) ?? null

  function handleSelectTile(id: string) {
    setSelectedTileId(id)
    setSelectedActivityId(null)
  }

  function handleSelectActivity(id: string) {
    setSelectedActivityId((current) => (current === id ? null : id))
  }

  // Deleting a tile takes its whole subtree with it (server-side, when
  // unused) — pre-emptively clear a stale activity selection so the options
  // panel doesn't linger on a node that's about to vanish from the list too.
  useEffect(() => {
    if (!selectedTileId || !selectedActivityId) return
    const subtree = collectSubtreeIds(activitiesResult.activities, selectedActivityId)
    if (!subtree.includes(selectedActivityId)) setSelectedActivityId(null)
  }, [selectedTileId, selectedActivityId, activitiesResult.activities])

  return (
    <section aria-label="Manage tiles and activities" className="flex flex-col gap-lg rounded-md border border-line bg-bg p-lg">
      <div>
        <h2 className="text-btn font-semibold text-ink">Manage tiles &amp; activities</h2>
        <p className="text-caption text-ink-dim">
          Add, rename, hide or delete your tiles and activities, and customize each activity&apos;s quality/symptom/
          protective-response options — nothing here is shared with anyone else.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2xl mobile:grid-cols-1">
        <TileList
          tiles={tilesResult.tiles}
          status={tilesResult.status}
          error={tilesResult.error}
          selectedTileId={selectedTileId}
          onSelect={handleSelectTile}
          actions={tilesResult}
        />

        <ActivityTree
          activities={activitiesResult.activities}
          tileId={selectedTileId}
          status={activitiesResult.status}
          error={activitiesResult.error}
          selectedActivityId={selectedActivityId}
          onSelect={handleSelectActivity}
          actions={activitiesResult}
        />

        {/*
          Keyed by the current selection so switching activities (or back to
          the fallback default) fully remounts this panel and its section
          children — found in self-review: their own local UI state
          (in-flight "busy" flags, an open "Add option" form, a row-level
          error message) otherwise survives a selection change untouched,
          since neither this component nor `ParameterOptionsPanel` itself
          would otherwise re-mount on a mere prop change. A stale "busy" flag
          left over from activity A's in-flight save would then disable every
          control on activity B's freshly-selected panel for no visible
          reason.
        */}
        <ParameterOptionsPanel
          key={selectedActivityId ?? 'default'}
          activityName={selectedActivity?.name ?? null}
          data={parameterOptions}
        />
      </div>
    </section>
  )
}
