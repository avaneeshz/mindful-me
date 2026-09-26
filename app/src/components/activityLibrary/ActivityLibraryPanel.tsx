import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { EyeOff, Pencil, X } from 'lucide-react'
import { ActivityTree } from '@/components/activityLibrary/ActivityTree'
import { ParameterOptionsPanel } from '@/components/activityLibrary/ParameterOptionsPanel'
import { ParameterVocabularyPanel } from '@/components/activityLibrary/ParameterVocabularyPanel'
import { TileForm, TileList } from '@/components/activityLibrary/TileList'
import { Button } from '@/components/ui/button'
import { resolveIcon } from '@/lib/iconRegistry'
import { cn } from '@/lib/utils'
import { activityPathNames, collectSubtreeIds } from '@/domain/pickerHierarchy'
import { usePickerData } from '@/state/PickerDataContext'
import { useActivityParameterSelections } from '@/state/useActivityParameterSelections'
import { useParameterVocabulary } from '@/state/useParameterVocabulary'

/**
 * Full user customization of the activity-picker hierarchy (PICKER-CUSTOM-1):
 * any number of tiles, any number of activities/sub-activities per tile to
 * arbitrary depth, and per-activity quality/chronic-symptom/protective-
 * response selection against one shared, growable vocabulary.
 *
 * Originally its own route, then folded inline as a `hidden`-toggled sibling
 * of `SlotEditor`'s main section (real user feedback — the same top-bar Edit
 * toggle had to reach it). This round's confirmed prototype changes the
 * OUTER CONTAINER again: it's now a real dialog (`@radix-ui/react-dialog`,
 * already a dependency — never hand-rolled), not inline page content —
 * `SlotEditor` passes `open={editMode}` straight through, so the same master
 * switch that already reveals `HeaderBar`'s quick-log pill controls also
 * opens/closes this dialog; closing it any way (X, Escape, overlay click)
 * calls `onClose`, which turns `editMode` off entirely (see `SlotEditor.tsx`'s
 * own doc comment for the full wiring). Deliberately no `<Dialog.Portal>` —
 * same reasoning as `TileRow.tsx`'s own tile-detail popup and
 * `LogActivityModal`: this whole app's test suite is SSR-string assertions
 * (`renderToStaticMarkup`), and a portal's content renders into a real DOM
 * node plain server rendering never produces.
 *
 * Responsive shape (same breakpoint `SlotEditor` already uses, ≤768px):
 * below it, the dialog fills the whole viewport edge to edge (no visible
 * backdrop); at/above it, a centered popup with the rest of the page still
 * visible, dimmed, behind it — reuses the exact `mobile:`/`md:` class pair
 * `TileRow.tsx`'s own popup dialog already established, just resized for a
 * wider three-column layout.
 *
 * `ActivityLibraryPanel` itself owns the selection state (`selectedTileId`/
 * `selectedActivityId`/`renamingTile`) and is mounted ONCE, lazily, by
 * `SlotEditor` (kept mounted forever after that first open, never
 * unmounted) — Radix's `Dialog.Content` unmounts ITS OWN children whenever
 * `open` is false, but that's one level BELOW where this state lives, so a
 * user's place in the tree survives closing and reopening the dialog exactly
 * as it did when this was a `hidden`-toggled `<div>` instead.
 *
 * Three-column layout on desktop/tablet (tiles -> activities -> options),
 * stacked into a single scrolling column on mobile — CLAUDE.md's "adapt
 * information hierarchy, don't just shrink" responsive rule.
 *
 * Two fixes from earlier direct user feedback, both purely
 * presentational/navigational (no change to `useTiles`/`useActivityHierarchy`
 * or the tile/activity RPC layer underneath):
 *
 * 1. `TileList`'s own grid looks exactly like the everyday picker's tile row
 *    (square icon+label cards) — see that module's own doc comment. Its
 *    cards carry a pencil-opens/×-deletes badge pair, not rename/hide —
 *    opening a tile shows a small "detail header" here, above `ActivityTree`,
 *    with that ONE tile's own Rename (reusing `TileForm`) and Hide controls.
 * 2. The per-activity options view (`ParameterOptionsPanel`) renders ONLY
 *    when `selectedActivity` is a real activity row, never merely because a
 *    tile is open — a tile only ever holds activities, never options of its
 *    own.
 *
 * This round's data-model pivot (PICKER-CUSTOM-1's parameter-options layer
 * replaced, not expand-contracted — see `20260925070000_parameter_options_
 * global_vocabulary.sql`'s own doc comment) changes what fills the third
 * column when NO activity is selected. The brief describes the new global
 * vocabulary editor (`ParameterVocabularyPanel`) as "a new top-level section,
 * shown before any tile is opened." Read strictly literally, that's
 * `selectedTileId === null` — but tiles auto-select the first one the moment
 * they load (see the effect below), so that state is nearly unreachable in
 * practice, which would undercut the brief's own stated goal ("fixes the
 * earlier gap where editing your defaults had no home"). JUDGMENT CALL,
 * flagged rather than silently picked: this renders `ParameterVocabularyPanel`
 * in the third column whenever `selectedActivity === null` — i.e. whenever
 * NO ACTIVITY is open, regardless of whether a tile is open — so it's the
 * third column's genuinely reachable "nothing drilled into yet" state, and
 * swaps for the per-activity checklist the moment a real activity is
 * selected. Worth confirming against the actual prototype.
 */
export function ActivityLibraryPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
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

  const vocabulary = useParameterVocabulary()
  const activitySelections = useActivityParameterSelections(selectedActivityId)
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
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-black/45" />
      <Dialog.Content
        className={cn(
          'fixed z-50 flex flex-col gap-lg overflow-y-auto bg-surface p-lg shadow-elevation-2 focus:outline-none',
          'inset-0 mobile:inset-0',
          'md:inset-auto md:left-1/2 md:top-1/2 md:w-[min(1080px,92vw)] md:max-h-[85vh] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg',
        )}
      >
        <div className="flex items-start justify-between gap-md">
          <div>
            <Dialog.Title asChild>
              <h2 className="text-btn font-semibold text-ink">Manage tiles &amp; activities</h2>
            </Dialog.Title>
            <Dialog.Description className="text-caption text-ink-dim">
              Add, rename, hide or delete your tiles and activities, and choose which of your options apply to
              each — nothing here is shared with anyone else.
            </Dialog.Description>
          </div>
          <Dialog.Close asChild>
            <button
              type="button"
              aria-label="Close"
              className="flex size-[32px] shrink-0 items-center justify-center rounded-full text-ink-dim transition-colors hover:bg-bg hover:text-ink"
            >
              <X aria-hidden="true" className="size-[18px]" />
            </button>
          </Dialog.Close>
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
              control (the exact same `TileForm` the grid's own "Add tile"
              card uses, just pre-filled) and a Hide control. Only shown once
              a real tile is open; `ActivityTree` below already handles "no
              tile selected" (`tileId === null`) with its own empty-state
              message.
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
            Only when the OPEN node is an actual activity does the third
            column show that activity's own checklist — never merely because
            a tile is open. Otherwise it shows the global vocabulary editor —
            see this component's own doc comment for the reachability
            judgment call behind that "otherwise." Keyed by the current
            selection so switching activities fully remounts the checklist
            and its section children — found in self-review (an earlier
            round, same idea applies here): their own local UI state
            (in-flight "busy" flags, a row-level error message) otherwise
            survives a selection change untouched.
          */}
          {selectedActivity ? (
            <ParameterOptionsPanel
              key={selectedActivity.id}
              activityName={selectedActivity.name}
              data={activitySelections}
              onManageVocabulary={() => setSelectedActivityId(null)}
            />
          ) : (
            <ParameterVocabularyPanel data={vocabulary} />
          )}
        </div>
      </Dialog.Content>
    </Dialog.Root>
  )
}
