import { useEffect, useState } from 'react'
import { LayoutGrid } from 'lucide-react'
import { ActivityTree } from '@/components/activityLibrary/ActivityTree'
import { ParameterOptionsPanel } from '@/components/activityLibrary/ParameterOptionsPanel'
import { TileList } from '@/components/activityLibrary/TileList'
import { activityPathNames, collectSubtreeIds } from '@/domain/pickerHierarchy'
import { useActivityHierarchy } from '@/state/useActivityHierarchy'
import { useParameterOptions } from '@/state/useParameterOptions'
import { useTiles } from '@/state/useTiles'

/**
 * "Activity Library" — full user customization of the activity-picker
 * hierarchy (PICKER-CUSTOM-1): any number of tiles, any number of
 * activities/sub-activities per tile to arbitrary depth, and per-activity
 * quality/chronic-symptom/protective-response option lists. Its own route
 * (`Sidebar.tsx`'s previously-inert "Activity Library" nav entry), not a
 * modal — there's real room to need here (three related lists at once), the
 * same reasoning `TodayPage`'s own SHELL NOTE anticipates for a second
 * screen. Deliberately keeps its own minimal shell (max-width + a plain page
 * header) rather than reaching for `TodayPage`'s `HeaderBar` — that bar is
 * today-specific chrome (date nav, sync status, quick-log popovers), not
 * reusable page furniture; hoisting a genuinely shared shell out of
 * `TodayPage` first, as that file's own SHELL NOTE asks for, is left for
 * whoever builds the third screen; see the report for how this was scoped.
 *
 * Three-column layout on desktop/tablet (tiles -> activities -> options),
 * stacked into a single scrolling column on mobile — CLAUDE.md's "adapt
 * information hierarchy, don't just shrink" responsive rule: a phone never
 * sees three side-by-side panes, it sees one focused list at a time in the
 * order you'd naturally drill down.
 */
export function ActivityLibraryPage() {
  const tilesResult = useTiles()
  const activitiesResult = useActivityHierarchy()
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
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-2xl px-lg py-2xl mobile:px-md">
      <header className="flex items-center gap-md">
        <span className="flex size-brand shrink-0 items-center justify-center rounded-md bg-inv-bg">
          <LayoutGrid aria-hidden="true" className="size-[18px] text-inv-ink" />
        </span>
        <div>
          <h1 className="font-display text-h1-sm font-semibold text-ink">Activity Library</h1>
          <p className="text-caption text-ink-dim">
            Customize your tiles, activities and per-activity option lists. Everything here is yours to edit — nothing is
            shared with anyone else.
          </p>
        </div>
      </header>

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

        <ParameterOptionsPanel activityName={selectedActivity?.name ?? null} data={parameterOptions} />
      </div>
    </div>
  )
}
