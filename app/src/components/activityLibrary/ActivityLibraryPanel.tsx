import { useEffect, useState } from 'react'
import { EyeOff, Pencil } from 'lucide-react'
import { ActivityTree } from '@/components/activityLibrary/ActivityTree'
import { ParameterOptionsPanel } from '@/components/activityLibrary/ParameterOptionsPanel'
import { TileForm, TileList } from '@/components/activityLibrary/TileList'
import { Button } from '@/components/ui/button'
import { resolveIcon } from '@/lib/iconRegistry'
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
 * from that original page (see the follow-up fixes below for what's changed
 * about how `TileList` and `ParameterOptionsPanel` are used here since);
 * only the surrounding shell (page-level header, `/activity-library` route)
 * was removed.
 *
 * Three-column layout on desktop/tablet (tiles -> activities -> options),
 * stacked into a single scrolling column on mobile — CLAUDE.md's "adapt
 * information hierarchy, don't just shrink" responsive rule: a phone never
 * sees three side-by-side panes, it sees one focused list at a time in the
 * order you'd naturally drill down.
 *
 * Two fixes from direct user feedback on a confirmed prototype, both purely
 * presentational/navigational (no change to `useTiles`/`useActivityHierarchy`/
 * `useParameterOptions` or the RPC layer underneath):
 *
 * 1. `TileList`'s own grid now looks exactly like the everyday picker's tile
 *    row (square icon+label cards), not a separate vertical row-list — see
 *    that module's own doc comment. Its cards no longer carry a rename/hide
 *    control of their own (no room next to the pencil-opens/×-deletes pair
 *    the redesign settled on) — opening a tile now shows a small "detail
 *    header" here, above `ActivityTree`, with that ONE tile's own Rename
 *    (reusing `TileForm`, unchanged) and Hide controls.
 * 2. `ParameterOptionsPanel` — quality/chronic-symptom/protective-response —
 *    now renders ONLY when `selectedActivity` is a real activity row, never
 *    merely because a tile is open. A tile only ever holds activities; it
 *    has no options of its own. One accepted consequence, flagged rather
 *    than silently kept: this also drops this panel's own former
 *    `activityName: null` "your default options" fallback view (previously
 *    shown whenever no activity happened to be selected) — that view isn't
 *    reachable from here any more either, since "nothing selected" is not
 *    "an activity is open." `ParameterOptionsPanel` itself still supports
 *    `activityName: null` as a prop (untouched — some other future call site
 *    could still use it); this component just never passes it any more.
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
  // The opened tile's own "Rename" form (reuses `TileForm` — see this
  // component's own doc comment). Reset whenever the open tile changes, so
  // switching tiles never leaves a stale rename form open on the new one.
  const [renamingTile, setRenamingTile] = useState(false)
  useEffect(() => {
    setRenamingTile(false)
  }, [selectedTileId])

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
  const selectedTile = tilesResult.tiles.find((t) => t.id === selectedTileId) ?? null
  const SelectedTileIcon = selectedTile ? resolveIcon(selectedTile.iconKey) : null

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

        <div className="flex flex-col gap-md">
          {/*
            The opened tile's own "detail header" — its name, a Rename
            control (the exact same `TileForm` the grid's own "Add tile" card
            uses, just pre-filled) and a Hide control. Only shown once a real
            tile is open; `ActivityTree` below already handles "no tile
            selected" (`tileId === null`) with its own empty-state message.
          */}
          {selectedTile &&
            (renamingTile ? (
              <TileForm
                initialLabel={selectedTile.label}
                initialIcon={selectedTile.iconKey}
                onSave={(label, iconKey) => {
                  tilesResult.renameTile(selectedTile.id, label, iconKey)
                  setRenamingTile(false)
                }}
                onCancel={() => setRenamingTile(false)}
              />
            ) : (
              <div className="flex items-center justify-between gap-sm rounded-md border border-line-soft bg-bg px-md py-sm">
                <div className="flex min-w-0 items-center gap-sm">
                  <span className="flex size-chip shrink-0 items-center justify-center rounded-sm bg-surface-2 text-ink">
                    {SelectedTileIcon && <SelectedTileIcon aria-hidden="true" className="size-[16px]" />}
                  </span>
                  <span className="truncate text-body font-semibold text-ink">{selectedTile.label}</span>
                </div>
                <div className="flex shrink-0 items-center gap-sm">
                  <Button variant="ghost" size="inline" onClick={() => setRenamingTile(true)}>
                    <Pencil aria-hidden="true" className="size-[13px]" />
                    <span>Rename</span>
                  </Button>
                  <Button variant="ghost" size="inline" onClick={() => tilesResult.hideTile(selectedTile.id)}>
                    <EyeOff aria-hidden="true" className="size-[13px]" />
                    <span>Hide</span>
                  </Button>
                </div>
              </div>
            ))}

          <ActivityTree
            activities={activitiesResult.activities}
            tileId={selectedTileId}
            status={activitiesResult.status}
            error={activitiesResult.error}
            selectedActivityId={selectedActivityId}
            onSelect={handleSelectActivity}
            actions={activitiesResult}
          />
        </div>

        {/*
          Only when the OPEN node is an actual activity — never merely
          because a tile is open (a tile only ever holds activities; it has
          no options of its own). Keyed by the current selection so switching
          activities fully remounts this panel and its section children —
          found in self-review: their own local UI state (in-flight "busy"
          flags, an open "Add option" form, a row-level error message)
          otherwise survives a selection change untouched, since neither this
          component nor `ParameterOptionsPanel` itself would otherwise
          re-mount on a mere prop change. A stale "busy" flag left over from
          activity A's in-flight save would then disable every control on
          activity B's freshly-selected panel for no visible reason.
        */}
        {selectedActivity && (
          <ParameterOptionsPanel key={selectedActivity.id} activityName={selectedActivity.name} data={parameterOptions} />
        )}
      </div>
    </section>
  )
}
