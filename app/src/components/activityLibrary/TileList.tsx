import { useRef, useState } from 'react'
import { Loader2, Pencil, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fieldClass } from '@/components/ui/formField'
import { ICON_CHOICES, resolveIcon } from '@/lib/iconRegistry'
import type { TileDto } from '@/api/tiles'
import type { UseTilesResult } from '@/state/useTiles'
import { cn } from '@/lib/utils'

/**
 * Add/rename form shared by "add a tile" and "rename this tile" — same
 * fields either way (name + the curated icon picker). Exported: the grid
 * below no longer has its own inline rename affordance (that moved to the
 * "open" tile's own detail header in `ActivityLibraryPanel`, which reuses
 * this exact form rather than a second copy of it — see that component's
 * own doc comment).
 */
export function TileForm({
  initialLabel = '',
  initialIcon = ICON_CHOICES[0].key,
  onSave,
  onCancel,
}: {
  initialLabel?: string
  initialIcon?: string
  onSave: (label: string, iconKey: string) => void
  onCancel: () => void
}) {
  const [label, setLabel] = useState(initialLabel)
  const [iconKey, setIconKey] = useState(initialIcon)

  return (
    <form
      className="flex flex-col gap-md rounded-md border border-line bg-surface p-md"
      onSubmit={(e) => {
        e.preventDefault()
        if (label.trim() === '') return
        onSave(label.trim(), iconKey)
      }}
    >
      <input
        autoFocus
        className={fieldClass}
        placeholder="Tile name"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        aria-label="Tile name"
      />
      <div className="flex flex-wrap gap-xs" role="radiogroup" aria-label="Icon">
        {ICON_CHOICES.map(({ key, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={iconKey === key}
            aria-label={key}
            onClick={() => setIconKey(key)}
            className={cn(
              'flex size-[32px] items-center justify-center rounded-sm border transition-colors',
              iconKey === key ? 'border-ink bg-ink/10' : 'border-line bg-bg hover:border-ink',
            )}
          >
            <Icon aria-hidden="true" className="size-[16px] text-ink" />
          </button>
        ))}
      </div>
      <div className="flex justify-end gap-sm">
        <Button type="button" variant="ghost" size="inline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="inline" disabled={label.trim() === ''}>
          Save
        </Button>
      </div>
    </form>
  )
}

/**
 * One tile in the grid — visually IDENTICAL to the everyday picker's own
 * square tile card (`components/editor/TileRow.tsx`'s `Tile`: aspect-square,
 * icon centered above label, `rounded-lg` border, same `.tile-row` grid) —
 * the confirmed prototype's whole point was that entering Edit mode must
 * never change how a tile looks. The only addition here is two small
 * circular badges overlaid on the card's top-right corner, each a real
 * sibling `<button>` (never nested inside the card's own button — mirrors
 * `TileRow.tsx`'s `ItemChip`'s own "mark done" badge, the established
 * pattern in this codebase for "a clickable card with a smaller clickable
 * badge on top of it" without invalid nested interactive elements):
 * - a pencil badge — opens this tile (shows its activity list below,
 *   the same navigation the card's own body already performs on click);
 * - an × badge — deletes this tile immediately (no confirmation dialog,
 *   matching the rest of this codebase's immediate-delete convention;
 *   `deleteTile` itself is what enforces history-safety server-side).
 *
 * No reorder (↑↓) here — dropped in the approved redesign, not an
 * oversight; a tile's position is no longer adjustable from this grid.
 */
function TileGridCard({
  tile,
  isSelected,
  onOpen,
  onDelete,
  deleting,
}: {
  tile: TileDto
  isSelected: boolean
  onOpen: () => void
  onDelete: () => void
  deleting: boolean
}) {
  const Icon = resolveIcon(tile.iconKey)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onOpen}
        aria-pressed={isSelected}
        aria-label={`${tile.label} tile`}
        className={cn(
          'relative flex aspect-square w-full flex-col items-center justify-center gap-sm overflow-hidden',
          'rounded-lg border bg-bg p-sm transition-colors',
          'hover:border-ink',
          isSelected ? 'border-ink shadow-[0_0_0_1px_var(--ink)]' : 'border-line',
        )}
      >
        <Icon aria-hidden="true" className="size-[20px] shrink-0 text-ink" />
        <span
          aria-hidden="true"
          className="w-full line-clamp-2 px-xs text-center text-micro font-bold leading-tight text-ink"
        >
          {tile.label}
        </span>
      </button>

      {/* The two edit-mode badges — overlaid on the corner, slightly
          outside the card's own edge (a `-top`/`-right` offset), like a
          notification badge. Sized well past this codebase's usual 18-24px
          inline icon buttons (`size-[28px]`) since these are the one
          control on this whole card a mobile user must be able to land a
          thumb on precisely, next to a sibling badge just as small. */}
      <div className="absolute -right-xs -top-xs flex gap-[6px]">
        <button
          type="button"
          aria-label={`Open ${tile.label}`}
          onClick={onOpen}
          className="flex size-[28px] items-center justify-center rounded-full border border-line bg-surface text-ink-dim shadow-elevation-1 transition-colors hover:border-ink hover:text-ink"
        >
          <Pencil aria-hidden="true" className="size-[13px]" />
        </button>
        <button
          type="button"
          aria-label={`Delete ${tile.label}`}
          onClick={onDelete}
          disabled={deleting}
          className="flex size-[28px] items-center justify-center rounded-full border border-line bg-surface text-ink-dim shadow-elevation-1 transition-colors hover:border-ink hover:text-ink disabled:pointer-events-none disabled:opacity-50"
        >
          {deleting ? (
            <Loader2 aria-hidden="true" className="size-[13px] animate-spin" />
          ) : (
            <X aria-hidden="true" className="size-[13px]" />
          )}
        </button>
      </div>
    </div>
  )
}

/** The trailing "add a tile" card — same square-card size/shape as a real tile, dashed border + a plus icon, never a differently-styled add row. */
function AddTileCard({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Add tile"
      className="flex aspect-square w-full flex-col items-center justify-center gap-sm rounded-lg border border-dashed border-line bg-bg p-sm text-ink-dim transition-colors hover:border-ink hover:text-ink"
    >
      <Plus aria-hidden="true" className="size-[20px] shrink-0" />
      <span aria-hidden="true" className="w-full text-center text-micro font-bold leading-tight">
        Add tile
      </span>
    </button>
  )
}

/**
 * The add-tile card once clicked — turns into an inline text input, still
 * card-shaped (per the confirmed prototype): Enter or blurring with a
 * non-empty name confirms, Escape or blurring while empty cancels. Icon
 * choice isn't part of this quick inline step — a brand-new tile gets the
 * same default icon `TileForm`'s own "add" flow already defaults to
 * (`ICON_CHOICES[0]`), and can be changed afterwards via that same curated
 * icon picker through the opened tile's own "Rename" control.
 */
function AddTileNameCard({ onConfirm, onCancel }: { onConfirm: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  // Guards against a single keystroke/blur sequence resolving twice — Enter
  // fires `confirm()` and then the input unmounts (this card is replaced by
  // the newly-created tile's own card), but if a browser still delivers a
  // trailing blur event first, this stops it from confirming (or cancelling)
  // a second time.
  const settledRef = useRef(false)

  function confirm() {
    if (settledRef.current) return
    settledRef.current = true
    const trimmed = name.trim()
    if (trimmed === '') {
      onCancel()
      return
    }
    onConfirm(trimmed)
  }

  function cancel() {
    if (settledRef.current) return
    settledRef.current = true
    onCancel()
  }

  return (
    <div className="flex aspect-square w-full flex-col items-center justify-center gap-sm rounded-lg border border-ink bg-bg p-sm">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            confirm()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            cancel()
          }
        }}
        onBlur={confirm}
        placeholder="Tile name"
        aria-label="New tile name"
        className="w-full min-w-0 border-0 bg-transparent text-center text-micro font-bold text-ink outline-none placeholder:font-normal placeholder:text-ink-dim"
      />
    </div>
  )
}

/**
 * The tile grid — the top-level picker's user-owned categories
 * (PICKER-CUSTOM-1, replacing the fixed 9-value `CategoryId` enum). Add,
 * open (drill into its activities), or delete when unused; hide/unhide
 * still exists but lives on the opened tile's own detail header
 * (`ActivityLibraryPanel`), not on this grid, once a tile has more than a
 * name to manage.
 *
 * Reuses the exact `.tile-row` CSS grid (`repeat(auto-fill, minmax(72px,
 * 1fr))`) the everyday picker's own tile row already established — any
 * number of tiles, reflowing responsively, never a fixed 3-column layout
 * and never a vertical list (the previous version of this component, before
 * this round's fix — see the module's own git history / the linked UX
 * brief for why that was wrong).
 */
export function TileList({
  tiles,
  status,
  error,
  selectedTileId,
  onSelect,
  actions,
}: {
  tiles: TileDto[]
  status: UseTilesResult['status']
  error: string | null
  selectedTileId: string | null
  onSelect: (id: string) => void
  actions: Pick<UseTilesResult, 'addTile' | 'deleteTile' | 'unhideTile'>
}) {
  const [adding, setAdding] = useState(false)
  // Every tile currently mid-delete, not just one — found in code review: a
  // single `string | null` guard blocked EVERY other tile's × badge while
  // one delete was in flight, but only visually disabled the one card
  // actually deleting. A click on a different tile's badge then silently
  // no-oped at the guard with no spinner, no error, nothing — indistinguishable
  // from the click not registering at all. Rule 9's double-submit guard only
  // ever needs to be PER tile.
  const [deletingIds, setDeletingIds] = useState<ReadonlySet<string>>(new Set())
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [showHidden, setShowHidden] = useState(false)

  const visible = tiles.filter((t) => !t.hidden).sort((a, b) => a.sortOrder - b.sortOrder)
  const hidden = tiles.filter((t) => t.hidden).sort((a, b) => a.sortOrder - b.sortOrder)

  async function handleDelete(id: string, label: string) {
    if (deletingIds.has(id)) return
    setDeleteError(null)
    setDeletingIds((prev) => new Set(prev).add(id))
    try {
      const result = await actions.deleteTile(id)
      if (!result.ok) {
        setDeleteError(
          result.reason === 'has_history'
            ? `"${label}" still has activities with logged history — hide it instead (open it, then use "Hide").`
            : 'Could not delete right now — try again once you’re back online.',
        )
      }
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  return (
    <section aria-label="Tiles" className="flex flex-col gap-md">
      <div className="flex items-center justify-between">
        <h2 className="text-btn font-semibold text-ink">Tiles</h2>
        {status === 'loading' && <Loader2 aria-hidden="true" className="size-[16px] animate-spin text-ink-dim" />}
      </div>

      {error && <p className="text-caption text-ink-dim">{error}</p>}
      {deleteError && (
        <p role="alert" className="text-caption text-ink-dim">
          {deleteError}
        </p>
      )}

      {status === 'ready' && visible.length === 0 && !adding && (
        <p className="text-caption text-ink-dim">No tiles yet — add your first one below.</p>
      )}

      <div className="tile-row">
        {visible.map((tile) => (
          <TileGridCard
            key={tile.id}
            tile={tile}
            isSelected={tile.id === selectedTileId}
            onOpen={() => onSelect(tile.id)}
            onDelete={() => void handleDelete(tile.id, tile.label)}
            deleting={deletingIds.has(tile.id)}
          />
        ))}

        {adding ? (
          <AddTileNameCard
            onConfirm={(name) => {
              const created = actions.addTile(name, ICON_CHOICES[0].key)
              onSelect(created.id)
              setAdding(false)
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <AddTileCard onOpen={() => setAdding(true)} />
        )}
      </div>

      {/* Hidden tiles have no card in the grid above (a hidden tile can't be
          "opened" — there's nothing to click), so this is the only remaining
          way back to one: unchanged from before this round's redesign, since
          the brief's fix is about the VISIBLE grid's own look and the
          options-panel gating, not this secondary utility list. */}
      {hidden.length > 0 && (
        <div>
          <Button variant="ghost" size="inline" onClick={() => setShowHidden((v) => !v)} aria-expanded={showHidden}>
            {showHidden ? 'Hide' : 'Show'} {hidden.length} hidden tile{hidden.length === 1 ? '' : 's'}
          </Button>
          {showHidden && (
            <ul className="mt-sm flex flex-col gap-xs">
              {hidden.map((tile) => (
                <li key={tile.id} className="flex items-center justify-between rounded-md border border-line-soft bg-bg px-md py-sm">
                  <span className="text-body text-ink-dim">{tile.label}</span>
                  <Button variant="accent" size="inline" onClick={() => actions.unhideTile(tile.id)}>
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
