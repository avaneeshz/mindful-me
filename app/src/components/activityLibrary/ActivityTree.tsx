import { useState } from 'react'
import { Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fieldClass } from '@/components/ui/formField'
import {
  activitiesForTile,
  activityPathNames,
  buildActivityTree,
  isSiblingNameTaken,
  isTopLevelNameTaken,
  type ActivityNode,
  type ActivityRow,
} from '@/domain/pickerHierarchy'
import type { UseActivityHierarchyResult } from '@/state/useActivityHierarchy'
import { cn } from '@/lib/utils'

type Actions = Pick<
  UseActivityHierarchyResult,
  'addActivity' | 'renameActivity' | 'hideActivity' | 'unhideActivity' | 'reorder' | 'deleteActivity'
>

function InlineNameForm({
  initial = '',
  error,
  onSave,
  onCancel,
}: {
  initial?: string
  /**
   * A validation error from the LAST submit attempt — found in code review:
   * a duplicate top-level name needs to keep this form open with the
   * rejected text still visible so the user can fix it in place, not close
   * it out from under them the way every other (always-succeeds, purely
   * local-first) save here does. `null`/omitted renders nothing.
   */
  error?: string | null
  onSave: (name: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial)
  return (
    <div className="flex flex-col gap-xs">
      <form
        className="flex items-center gap-sm"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim() === '') return
          onSave(name.trim())
        }}
      >
        <input autoFocus className={cn(fieldClass, 'py-xs')} value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" />
        <Button type="submit" size="inline" disabled={name.trim() === ''}>
          Save
        </Button>
        <Button type="button" variant="ghost" size="inline" onClick={onCancel}>
          Cancel
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-caption text-ink-dim">
          {error}
        </p>
      )}
    </div>
  )
}

function ActivityRowView({
  node,
  depth,
  siblingIndex,
  siblingCount,
  activities,
  selectedActivityId,
  onSelect,
  actions,
  deleteError,
  setDeleteError,
}: {
  node: ActivityNode
  depth: number
  siblingIndex: number
  siblingCount: number
  /** The FULL flat activity list (every tile, hidden included) — needed only for `isTopLevelNameTaken`'s own duplicate check when renaming a top-level node. */
  activities: readonly ActivityRow[]
  selectedActivityId: string | null
  onSelect: (id: string) => void
  actions: Actions
  deleteError: string | null
  setDeleteError: (message: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [addingChild, setAddingChild] = useState(false)
  const [addChildError, setAddChildError] = useState<string | null>(null)
  const isSelected = node.id === selectedActivityId

  async function handleDelete() {
    setDeleteError(null)
    const result = await actions.deleteActivity(node.id)
    if (!result.ok) {
      setDeleteError(
        result.reason === 'has_history'
          ? `"${node.name}" still has logged history — hide it instead.`
          : 'Could not delete right now — try again once you’re back online.',
      )
    }
  }

  return (
    <li>
      <div
        className={cn(
          'flex items-center gap-sm rounded-md border px-md py-sm transition-colors',
          isSelected ? 'border-ink bg-ink/[0.06]' : 'border-line bg-surface hover:border-ink',
        )}
        style={{ marginLeft: depth * 20 }}
      >
        {editing ? (
          <InlineNameForm
            initial={node.name}
            error={renameError}
            onSave={(name) => {
              // A TOP-LEVEL rename can collide user-wide (the bug this round
              // fixes — see `isTopLevelNameTaken`'s own doc comment); a
              // sub-activity rename can only collide with its OWN siblings
              // (already a narrower, always-correctly-enforced DB scope via
              // `activities_parent_id_name_key` — `isSiblingNameTaken` just
              // gives it the same inline feedback the top-level case now
              // gets, found missing in code review).
              if (node.parentId === null) {
                if (isTopLevelNameTaken(activities, name, node.id)) {
                  setRenameError(`You already have a top-level activity named "${name}" — pick a different name.`)
                  return
                }
              } else if (isSiblingNameTaken(activities, node.parentId, name, node.id)) {
                setRenameError(`You already have an activity named "${name}" here — pick a different name.`)
                return
              }
              setRenameError(null)
              actions.renameActivity(node.id, name)
              setEditing(false)
            }}
            onCancel={() => {
              setEditing(false)
              setRenameError(null)
            }}
          />
        ) : (
          <>
            <button type="button" onClick={() => onSelect(node.id)} aria-pressed={isSelected} className="min-w-0 flex-1 truncate text-left text-body text-ink">
              {node.name}
            </button>
            <div className="flex shrink-0 items-center gap-xs">
              <span className="sr-only">
                {siblingIndex + 1} of {siblingCount}
              </span>
              <button
                type="button"
                aria-label={`Add a sub-activity under ${node.name}`}
                onClick={() => {
                  setAddingChild(true)
                  setAddChildError(null)
                }}
                className="flex size-[24px] items-center justify-center rounded-sm text-ink-dim hover:text-ink"
              >
                <Plus aria-hidden="true" className="size-[13px]" />
              </button>
              <button
                type="button"
                aria-label={`Rename ${node.name}`}
                onClick={() => {
                  setEditing(true)
                  setRenameError(null)
                }}
                className="flex size-[24px] items-center justify-center rounded-sm text-ink-dim hover:text-ink"
              >
                <Pencil aria-hidden="true" className="size-[13px]" />
              </button>
              <button
                type="button"
                aria-label={`Hide ${node.name}`}
                onClick={() => actions.hideActivity(node.id)}
                className="flex size-[24px] items-center justify-center rounded-sm text-ink-dim hover:text-ink"
              >
                <X aria-hidden="true" className="size-[13px]" />
              </button>
              <button
                type="button"
                aria-label={`Delete ${node.name}`}
                onClick={() => void handleDelete()}
                className="flex size-[24px] items-center justify-center rounded-sm text-ink-dim hover:text-ink"
              >
                <Trash2 aria-hidden="true" className="size-[13px]" />
              </button>
            </div>
          </>
        )}
      </div>
      {deleteError && isSelected && (
        <p role="alert" className="mt-xs text-caption text-ink-dim" style={{ marginLeft: depth * 20 }}>
          {deleteError}
        </p>
      )}

      {addingChild && (
        <div className="mt-xs" style={{ marginLeft: (depth + 1) * 20 }}>
          <InlineNameForm
            error={addChildError}
            onSave={(name) => {
              if (isSiblingNameTaken(activities, node.id, name)) {
                setAddChildError(`You already have an activity named "${name}" here — pick a different name.`)
                return
              }
              setAddChildError(null)
              actions.addActivity({ name, parentId: node.id })
              setAddingChild(false)
            }}
            onCancel={() => {
              setAddingChild(false)
              setAddChildError(null)
            }}
          />
        </div>
      )}

      {node.children.length > 0 && (
        <ul className="mt-xs flex flex-col gap-xs">
          {node.children.map((child, index) => (
            <ActivityRowView
              key={child.id}
              node={child}
              depth={depth + 1}
              siblingIndex={index}
              siblingCount={node.children.length}
              activities={activities}
              selectedActivityId={selectedActivityId}
              onSelect={onSelect}
              actions={actions}
              deleteError={deleteError}
              setDeleteError={setDeleteError}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

/**
 * A tile's full activity tree — arbitrary depth (no 3-level "top/sub/third"
 * cap; whatever `parent_id` chains the user has actually built renders
 * uniformly). Reorder within a sibling group is up/down buttons on the
 * TOP-LEVEL row only in this pass (children reorder among themselves the
 * same way once selected — a drag-based reorder across depths was judged
 * more complexity than this settings surface needs; see the report).
 */
export function ActivityTree({
  activities,
  tileId,
  status,
  error,
  selectedActivityId,
  onSelect,
  actions,
}: {
  activities: Parameters<typeof buildActivityTree>[0]
  tileId: string | null
  status: UseActivityHierarchyResult['status']
  error: string | null
  selectedActivityId: string | null
  onSelect: (id: string) => void
  actions: Actions
}) {
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [showHidden, setShowHidden] = useState(false)

  if (tileId === null) {
    return <p className="text-caption text-ink-dim">Select a tile to see its activities.</p>
  }

  // A hidden node (at ANY depth, not just top-level — unlike `TileList`'s
  // flat hide) is excluded from the main tree entirely, same as a hidden
  // tile excludes its activities — found missing in review: this used to
  // build the tree from every activity regardless of `hidden`, so a hidden
  // activity looked completely normal, with no way to tell it was hidden or
  // to unhide it (`unhideActivity` was never called anywhere in this file).
  const tree = buildActivityTree(
    activities.filter((a) => !a.hidden),
    tileId,
  )
  const hiddenInTile = activitiesForTile(activities, tileId).filter((a) => a.hidden)

  function moveTopLevel(id: string, direction: -1 | 1) {
    const order = tree.map((n) => n.id)
    const index = order.indexOf(id)
    const target = index + direction
    if (target < 0 || target >= order.length) return
    ;[order[index], order[target]] = [order[target], order[index]]
    actions.reorder(order)
  }

  return (
    <section aria-label="Activities" className="flex flex-col gap-md">
      <div className="flex items-center justify-between">
        <h2 className="text-btn font-semibold text-ink">Activities</h2>
        {status === 'loading' && <Loader2 aria-hidden="true" className="size-[16px] animate-spin text-ink-dim" />}
      </div>
      {error && <p className="text-caption text-ink-dim">{error}</p>}

      {status === 'ready' && tree.length === 0 && !adding && (
        <p className="text-caption text-ink-dim">No activities under this tile yet.</p>
      )}

      <ul className="flex flex-col gap-xs">
        {tree.map((node, index) => (
          <li key={node.id} className="flex items-start gap-xs">
            <div className="mt-sm flex flex-col gap-[2px]">
              <button
                type="button"
                aria-label={`Move ${node.name} up`}
                disabled={index === 0}
                onClick={() => moveTopLevel(node.id, -1)}
                className="flex size-[20px] items-center justify-center rounded-sm text-ink-dim hover:text-ink disabled:pointer-events-none disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move ${node.name} down`}
                disabled={index === tree.length - 1}
                onClick={() => moveTopLevel(node.id, 1)}
                className="flex size-[20px] items-center justify-center rounded-sm text-ink-dim hover:text-ink disabled:pointer-events-none disabled:opacity-30"
              >
                ↓
              </button>
            </div>
            <ul className="flex-1">
              <ActivityRowView
                node={node}
                depth={0}
                siblingIndex={index}
                siblingCount={tree.length}
                activities={activities}
                selectedActivityId={selectedActivityId}
                onSelect={onSelect}
                actions={actions}
                deleteError={deleteError}
                setDeleteError={setDeleteError}
              />
            </ul>
          </li>
        ))}
      </ul>

      {adding ? (
        <InlineNameForm
          error={addError}
          onSave={(name) => {
            // Found in code review: a top-level activity's name has to be
            // unique across the WHOLE user, not just this tile — two
            // different top-level activities in two different tiles sharing
            // a name used to silently corrupt which one a real log actually
            // attached to (`catalogIdForName`/`liveCardsByName` are both
            // plain name-keyed maps spanning every tile). This client-side
            // check is what actually stops it in normal use; the database
            // itself now also enforces it
            // (`activities_top_level_name_per_user_idx`) as the safety net
            // behind this, per rule 1.
            if (isTopLevelNameTaken(activities, name)) {
              setAddError(`You already have a top-level activity named "${name}" — pick a different name.`)
              return
            }
            setAddError(null)
            const created = actions.addActivity({ name, tileId })
            onSelect(created.id)
            setAdding(false)
          }}
          onCancel={() => {
            setAdding(false)
            setAddError(null)
          }}
        />
      ) : (
        <Button
          variant="outline"
          size="inline"
          onClick={() => {
            setAdding(true)
            setAddError(null)
          }}
          className="self-start px-md py-sm"
        >
          <Plus aria-hidden="true" className="size-[14px]" />
          <span>Add activity</span>
        </Button>
      )}

      {hiddenInTile.length > 0 && (
        <div>
          <Button variant="ghost" size="inline" onClick={() => setShowHidden((v) => !v)} aria-expanded={showHidden}>
            {showHidden ? 'Hide' : 'Show'} {hiddenInTile.length} hidden activit{hiddenInTile.length === 1 ? 'y' : 'ies'}
          </Button>
          {showHidden && (
            <ul className="mt-sm flex flex-col gap-xs">
              {hiddenInTile.map((activity) => (
                <li
                  key={activity.id}
                  className="flex items-center justify-between rounded-md border border-line-soft bg-bg px-md py-sm"
                >
                  <span className="text-body text-ink-dim">{activityPathNames(activities, activity.id).join(' → ')}</span>
                  <Button variant="accent" size="inline" onClick={() => actions.unhideActivity(activity.id)}>
                    Unhide
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
