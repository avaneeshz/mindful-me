import { ArrowDown, ArrowUp, ChevronDown, EyeOff, Palette, Pencil, Plus, SlidersHorizontal, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { buildActivityTree, type ActivityNode, type ActivityRow } from '@/domain/pickerHierarchy'
import { resolveIcon } from '@/lib/iconRegistry'
import { supabaseConfigured } from '@/lib/supabaseClient'
import { usePickerData } from '@/state/PickerDataContext'
import { useActivityParameterSelections } from '@/state/useActivityParameterSelections'
import { useParameterVocabulary } from '@/state/useParameterVocabulary'
import { Button } from '@/lumen/components/ui/button'
import { IconBubble, MenuItem } from '@/lumen/components/ui/primitives'
import { FALLBACK_COLOR } from '@/lumen/lib/palette'
import { useStore } from '@/lumen/lib/store'
import { cn } from '@/lumen/lib/utils'
import { AddRow, ColorSheet, ConfirmSheet, EditRow, Group, NameSheet, Notice, OptionSection, OPTION_SECTIONS, SettingsPage, SmallIcon } from './parts'

type Level = { kind: 'tile'; id: string } | { kind: 'activity'; id: string } | { kind: 'defaults' }

/**
 * Tiles & activities — Lumen's own editor over the same per-person data
 * Classic's Activity Library edits (`usePickerData`'s shared tiles and
 * activity hierarchy; option lists via `useParameterSectionEditor`, which
 * reads/writes the exact same `useParameterVocabulary`/
 * `useActivityParameterSelections` data Classic's own `ParameterOptionsPanel`/
 * `ParameterVocabularyPanel` do — not the same hook call, the same
 * underlying account-level data; see `useParameterSectionEditor`'s own doc
 * comment). Built to drill down, one level at a time, which suits a phone:
 * tiles → a tile's activities → an activity's sub-options and option lists.
 * Every change is the person's own and shows in both interfaces.
 */
export function LibraryScreen({ onBack }: { onBack: () => void }) {
  const [stack, setStack] = useState<Level[]>([])
  const level = stack[stack.length - 1]
  const push = (l: Level) => setStack((s) => [...s, l])
  const pop = () => setStack((s) => s.slice(0, -1))

  if (!level) return <TilesLevel onBack={onBack} onOpen={push} />
  if (level.kind === 'defaults') return <DefaultsLevel onBack={pop} />
  return <NodeLevel key={`${level.kind}:${level.id}`} level={level} onBack={pop} onOpen={push} />
}

function useLocalOnlyNotice() {
  return supabaseConfigured ? null : (
    <Notice>You’re not signed in to an account, so changes here last only until you reload.</Notice>
  )
}

/* ——— Tiles ——— */

function TilesLevel({ onBack, onOpen }: { onBack: () => void; onOpen: (l: Level) => void }) {
  const { tiles: tilesResult, activities } = usePickerData()
  const { allTiles, setTileColor } = useStore()
  const [naming, setNaming] = useState<null | { id: string | null }>(null)
  const [coloring, setColoring] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const notice = useLocalOnlyNotice()

  const visible = tilesResult.tiles.filter((t) => !t.hidden).sort((a, b) => a.sortOrder - b.sortOrder)
  const hidden = tilesResult.tiles.filter((t) => t.hidden).sort((a, b) => a.sortOrder - b.sortOrder)
  const colorOf = (id: string) => allTiles.find((t) => t.id === id)?.color ?? FALLBACK_COLOR
  const countOf = (id: string) => activities.activities.filter((a) => a.tileId === id && a.parentId === null && !a.hidden).length
  const editingTile = naming?.id ? tilesResult.tiles.find((t) => t.id === naming.id) : undefined

  function move(id: string, dir: -1 | 1) {
    const order = visible.map((t) => t.id)
    const i = order.indexOf(id)
    const j = i + dir
    if (j < 0 || j >= order.length) return
    ;[order[i], order[j]] = [order[j], order[i]]
    tilesResult.reorder(order)
  }

  async function remove(id: string) {
    setMessage(null)
    const result = await tilesResult.deleteTile(id)
    if (!result.ok) {
      setMessage(
        result.reason === 'has_history'
          ? 'That tile still has activities with logged history — hide it instead.'
          : 'Could not delete right now — try again once you’re back online.',
      )
    }
  }

  return (
    <SettingsPage eyebrow="Settings" title="Tiles & activities" onBack={onBack}>
      {notice}
      {tilesResult.error && <Notice>{tilesResult.error}</Notice>}
      {message && (
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      )}

      <Group title="Tiles">
        {tilesResult.status === 'loading' && visible.length === 0 && <p className="px-4 py-5 text-sm text-ink-faint">Loading your tiles…</p>}
        {visible.map((tile, i) => {
          const color = colorOf(tile.id)
          const n = countOf(tile.id)
          return (
            <EditRow
              key={tile.id}
              lead={<IconBubble icon={resolveIcon(tile.iconKey)} color={color.id} />}
              label={tile.label}
              hint={`${n} ${n === 1 ? 'activity' : 'activities'}`}
              onOpen={() => onOpen({ kind: 'tile', id: tile.id })}
              menu={(close) => (
                <>
                  <MenuItem icon={Pencil} onSelect={() => { close(); setNaming({ id: tile.id }) }}>Rename & icon</MenuItem>
                  <MenuItem icon={Palette} hint={color.name} onSelect={() => { close(); setColoring(tile.id) }}>Colour</MenuItem>
                  <MenuItem icon={ArrowUp} disabled={i === 0} onSelect={() => { close(); move(tile.id, -1) }}>Move up</MenuItem>
                  <MenuItem icon={ArrowDown} disabled={i === visible.length - 1} onSelect={() => { close(); move(tile.id, 1) }}>Move down</MenuItem>
                  <MenuItem icon={EyeOff} onSelect={() => { close(); tilesResult.hideTile(tile.id) }}>Hide</MenuItem>
                  <MenuItem icon={Trash2} tone="danger" onSelect={() => { close(); setDeleting(tile.id) }}>Delete</MenuItem>
                </>
              )}
            />
          )
        })}
        <AddRow label="Add a tile" onClick={() => setNaming({ id: null })} />
      </Group>

      {hidden.length > 0 && (
        <HiddenList
          count={hidden.length}
          noun="tile"
          plural="tiles"
          open={showHidden}
          onToggle={() => setShowHidden((s) => !s)}
          items={hidden.map((t) => ({ id: t.id, label: t.label, onShow: () => tilesResult.unhideTile(t.id) }))}
        />
      )}

      <Group title="Everything else">
        <EditRow
          lead={<SmallIcon icon={SlidersHorizontal} />}
          label="Default options"
          hint="Quality, symptoms and responses for activities without their own"
          onOpen={() => onOpen({ kind: 'defaults' })}
        />
      </Group>

      <NameSheet
        open={naming !== null}
        title={editingTile ? `Rename ${editingTile.label}` : 'Add a tile'}
        initialName={editingTile?.label ?? ''}
        initialIcon={editingTile?.iconKey}
        withIcon
        saveLabel={editingTile ? 'Save' : 'Add tile'}
        onSave={(name, icon) => (editingTile ? tilesResult.renameTile(editingTile.id, name, icon) : tilesResult.addTile(name, icon))}
        onClose={() => setNaming(null)}
      />
      <ColorSheet
        open={coloring !== null}
        title="Tile colour"
        value={coloring ? colorOf(coloring).id : ''}
        onPick={(id) => coloring && setTileColor(coloring, id)}
        onClose={() => setColoring(null)}
      />
      <ConfirmSheet
        open={deleting !== null}
        title={`Delete ${tilesResult.tiles.find((t) => t.id === deleting)?.label ?? 'tile'}?`}
        body="This removes the tile and its activities. A tile with logged history can’t be deleted — hide it instead, so your past entries keep their place."
        confirmLabel="Delete"
        onConfirm={() => deleting && void remove(deleting)}
        onClose={() => setDeleting(null)}
      />
    </SettingsPage>
  )
}

/* ——— A tile's activities, or an activity's sub-options and option lists ——— */

function NodeLevel({
  level,
  onBack,
  onOpen,
}: {
  level: { kind: 'tile'; id: string } | { kind: 'activity'; id: string }
  onBack: () => void
  onOpen: (l: Level) => void
}) {
  const { tiles: tilesResult, activities: activitiesResult } = usePickerData()
  const { allTiles } = useStore()
  const [naming, setNaming] = useState<null | { id: string | null }>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const notice = useLocalOnlyNotice()

  const rows = activitiesResult.activities
  const self = level.kind === 'activity' ? rows.find((a) => a.id === level.id) : undefined
  const tileId = level.kind === 'tile' ? level.id : topTileOf(rows, level.id)
  const tile = tilesResult.tiles.find((t) => t.id === tileId)
  const color = allTiles.find((t) => t.id === tileId)?.color ?? FALLBACK_COLOR

  const tree = tileId ? buildActivityTree(rows.filter((a) => !a.hidden), tileId) : []
  const children: ActivityNode[] = level.kind === 'tile' ? tree : findNode(tree, level.id)?.children ?? []
  const hiddenChildren = rows
    .filter((a) => a.hidden && (level.kind === 'tile' ? a.tileId === level.id && a.parentId === null : a.parentId === level.id))
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const editing = naming?.id ? rows.find((a) => a.id === naming.id) : undefined

  function move(id: string, dir: -1 | 1) {
    const order = children.map((n) => n.id)
    const i = order.indexOf(id)
    const j = i + dir
    if (j < 0 || j >= order.length) return
    ;[order[i], order[j]] = [order[j], order[i]]
    activitiesResult.reorder(order)
  }

  async function remove(id: string) {
    setMessage(null)
    const name = rows.find((a) => a.id === id)?.name ?? 'That activity'
    const result = await activitiesResult.deleteActivity(id)
    if (!result.ok) {
      setMessage(
        result.reason === 'has_history'
          ? `"${name}" still has logged history — hide it instead.`
          : 'Could not delete right now — try again once you’re back online.',
      )
    }
  }

  if (level.kind === 'activity' && !self) {
    return (
      <SettingsPage eyebrow={tile?.label ?? 'Tiles & activities'} title="Not found" onBack={onBack}>
        <Notice>This activity was deleted.</Notice>
      </SettingsPage>
    )
  }

  const title = self?.name ?? tile?.label ?? 'Tile'
  const noun = level.kind === 'tile' ? 'activity' : 'sub-option'

  return (
    <SettingsPage eyebrow={level.kind === 'tile' ? 'Tiles & activities' : tile?.label ?? 'Activity'} title={title} onBack={onBack}>
      {notice}
      {activitiesResult.error && <Notice>{activitiesResult.error}</Notice>}
      {message && (
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      )}

      <Group title={level.kind === 'tile' ? 'Activities' : 'Sub-options'}>
        {children.length === 0 && (
          <p className="px-4 py-4 text-sm text-ink-faint">
            {level.kind === 'tile' ? 'No activities yet.' : 'None — this activity is logged as it is.'}
          </p>
        )}
        {children.map((node, i) => (
          <EditRow
            key={node.id}
            lead={level.kind === 'tile' ? <IconBubble icon={resolveIcon(node.iconKey ?? tile?.iconKey)} color={color.id} size="sm" /> : undefined}
            label={node.name}
            hint={node.children.length ? `${node.children.length} ${node.children.length === 1 ? 'sub-option' : 'sub-options'}` : undefined}
            onOpen={() => onOpen({ kind: 'activity', id: node.id })}
            menu={(close) => (
              <>
                <MenuItem icon={Pencil} onSelect={() => { close(); setNaming({ id: node.id }) }}>Rename</MenuItem>
                <MenuItem icon={ArrowUp} disabled={i === 0} onSelect={() => { close(); move(node.id, -1) }}>Move up</MenuItem>
                <MenuItem icon={ArrowDown} disabled={i === children.length - 1} onSelect={() => { close(); move(node.id, 1) }}>Move down</MenuItem>
                <MenuItem icon={EyeOff} onSelect={() => { close(); activitiesResult.hideActivity(node.id) }}>Hide</MenuItem>
                <MenuItem icon={Trash2} tone="danger" onSelect={() => { close(); setDeleting(node.id) }}>Delete</MenuItem>
              </>
            )}
          />
        ))}
        <AddRow label={`Add ${noun === 'activity' ? 'an activity' : 'a sub-option'}`} onClick={() => setNaming({ id: null })} />
      </Group>

      {hiddenChildren.length > 0 && (
        <HiddenList
          count={hiddenChildren.length}
          noun={noun}
          plural={noun === 'activity' ? 'activities' : 'sub-options'}
          open={showHidden}
          onToggle={() => setShowHidden((s) => !s)}
          items={hiddenChildren.map((a) => ({ id: a.id, label: a.name, onShow: () => activitiesResult.unhideActivity(a.id) }))}
        />
      )}

      {level.kind === 'activity' && self && <ActivityOptions activity={self} />}

      <NameSheet
        open={naming !== null}
        title={editing ? `Rename ${editing.name}` : `Add ${noun === 'activity' ? 'an activity' : 'a sub-option'}`}
        initialName={editing?.name ?? ''}
        saveLabel={editing ? 'Save' : 'Add'}
        onSave={(name) =>
          editing
            ? activitiesResult.renameActivity(editing.id, name)
            : activitiesResult.addActivity(level.kind === 'tile' ? { name, tileId: level.id } : { name, parentId: level.id })
        }
        onClose={() => setNaming(null)}
      />
      <ConfirmSheet
        open={deleting !== null}
        title={`Delete ${rows.find((a) => a.id === deleting)?.name ?? noun}?`}
        body="This removes it and everything under it. Anything with logged history can’t be deleted — hide it instead, so past entries keep their name."
        confirmLabel="Delete"
        onConfirm={() => deleting && void remove(deleting)}
        onClose={() => setDeleting(null)}
      />
    </SettingsPage>
  )
}

/**
 * The activity's own option lists, falling back to its parent's (then the
 * defaults) until customized here. `useActivityParameterSelections`/
 * `useParameterVocabulary` are instantiated ONCE here, for the whole screen,
 * and passed to every `OptionSection` — found in code review: an earlier
 * version let each of the 3 sections mint its own pair of instances,
 * tripling the fetch cost per screen load for no benefit (the old
 * `useParameterOptions(activity.id)`-passed-as-a-shared-prop design this
 * replaced never had that problem either).
 */
function ActivityOptions({ activity }: { activity: ActivityRow }) {
  const selections = useActivityParameterSelections(activity.id)
  const vocabulary = useParameterVocabulary()
  return (
    <section className="flex flex-col gap-3">
      <div className="px-1">
        <h2 className="text-xs font-medium uppercase tracking-[0.08em] text-ink-faint">Options when logging</h2>
        <p className="mt-1 text-sm text-ink-muted">Customize what “How it went” offers for {activity.name}.</p>
      </div>
      {OPTION_SECTIONS.map((section) => (
        <OptionSection
          key={`${activity.id}:${section.type}`}
          section={section}
          activityName={activity.name}
          activityId={activity.id}
          selections={selections}
          vocabulary={vocabulary}
        />
      ))}
    </section>
  )
}

function DefaultsLevel({ onBack }: { onBack: () => void }) {
  const notice = useLocalOnlyNotice()
  // `activityId: null` throughout — the fallback scope has no activity to
  // select against, only the shared vocabulary itself (see
  // `useParameterSectionEditor`'s own doc comment) — but every `OptionSection`
  // still needs a (harmlessly idle) `selections` instance to satisfy its
  // props, same as `ActivityOptions`'s one-instance-per-screen pattern.
  const selections = useActivityParameterSelections(null)
  const vocabulary = useParameterVocabulary()
  return (
    <SettingsPage eyebrow="Tiles & activities" title="Default options" onBack={onBack}>
      {notice}
      <p className="text-sm text-ink-muted">These show for every activity that doesn’t have its own list.</p>
      {OPTION_SECTIONS.map((section) => (
        <OptionSection
          key={`default:${section.type}`}
          section={section}
          activityName={null}
          activityId={null}
          selections={selections}
          vocabulary={vocabulary}
        />
      ))}
    </SettingsPage>
  )
}

function HiddenList({
  count,
  noun,
  plural,
  open,
  onToggle,
  items,
}: {
  count: number
  noun: string
  plural: string
  open: boolean
  onToggle: () => void
  items: { id: string; label: string; onShow: () => void }[]
}) {
  return (
    <section>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex min-h-11 w-full items-center justify-between rounded-control px-1 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
      >
        {count} hidden {count === 1 ? noun : plural}
        <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="surface mt-2 divide-y divide-line/[0.06] overflow-hidden rounded-card">
          {items.map((item) => (
            <div key={item.id} className="flex min-h-14 items-center gap-3 px-4">
              <span className="flex-1 truncate text-[15px] text-ink-muted">{item.label}</span>
              <Button variant="ghost" className="h-9 px-3 text-accent-ink" onClick={item.onShow}>
                <Plus className="h-4 w-4" />
                Show
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function findNode(nodes: readonly ActivityNode[], id: string): ActivityNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n
    const found = findNode(n.children, id)
    if (found) return found
  }
  return undefined
}

function topTileOf(rows: readonly ActivityRow[], id: string): string | null {
  let node = rows.find((a) => a.id === id)
  while (node && node.parentId) node = rows.find((a) => a.id === node!.parentId)
  return node?.tileId ?? null
}
