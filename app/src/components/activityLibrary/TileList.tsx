import { useState } from 'react'
import { Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fieldClass } from '@/components/ui/formField'
import { ICON_CHOICES, resolveIcon } from '@/lib/iconRegistry'
import type { TileDto } from '@/api/tiles'
import type { UseTilesResult } from '@/state/useTiles'
import { cn } from '@/lib/utils'

/** Add/rename form shared by "add a tile" and "rename this tile" — same fields either way. */
function TileForm({
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
 * The tile list — the top-level picker's user-owned categories
 * (PICKER-CUSTOM-1, replacing the fixed 9-value `CategoryId` enum). Add,
 * rename, hide/unhide, reorder (move up/down — simple and fully keyboard-
 * operable, rather than a pointer-only drag reorder for what is usually a
 * handful of rows), delete when unused.
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
  actions: Pick<UseTilesResult, 'addTile' | 'renameTile' | 'hideTile' | 'unhideTile' | 'reorder' | 'deleteTile'>
}) {
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [showHidden, setShowHidden] = useState(false)

  const visible = tiles.filter((t) => !t.hidden).sort((a, b) => a.sortOrder - b.sortOrder)
  const hidden = tiles.filter((t) => t.hidden).sort((a, b) => a.sortOrder - b.sortOrder)

  function move(id: string, direction: -1 | 1) {
    const order = visible.map((t) => t.id)
    const index = order.indexOf(id)
    const target = index + direction
    if (target < 0 || target >= order.length) return
    ;[order[index], order[target]] = [order[target], order[index]]
    actions.reorder(order)
  }

  async function handleDelete(id: string) {
    setDeleteError(null)
    const result = await actions.deleteTile(id)
    if (!result.ok) {
      setDeleteError(
        result.reason === 'has_history'
          ? 'This tile still has activities with logged history — hide it instead.'
          : 'Could not delete right now — try again once you’re back online.',
      )
    }
  }

  return (
    <section aria-label="Tiles" className="flex flex-col gap-md">
      <div className="flex items-center justify-between">
        <h2 className="text-btn font-semibold text-ink">Tiles</h2>
        {status === 'loading' && <Loader2 aria-hidden="true" className="size-[16px] animate-spin text-ink-dim" />}
      </div>

      {error && <p className="text-caption text-ink-dim">{error}</p>}
      {deleteError && <p role="alert" className="text-caption text-ink-dim">{deleteError}</p>}

      {status === 'ready' && visible.length === 0 && !adding && (
        <p className="text-caption text-ink-dim">No tiles yet — add your first one below.</p>
      )}

      <ul className="flex flex-col gap-xs">
        {visible.map((tile, index) => {
          const Icon = resolveIcon(tile.iconKey)
          const isSelected = tile.id === selectedTileId
          if (editingId === tile.id) {
            return (
              <li key={tile.id}>
                <TileForm
                  initialLabel={tile.label}
                  initialIcon={tile.iconKey}
                  onSave={(label, iconKey) => {
                    actions.renameTile(tile.id, label, iconKey)
                    setEditingId(null)
                  }}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            )
          }
          return (
            <li key={tile.id}>
              <div
                className={cn(
                  'group flex items-center gap-md rounded-md border px-md py-sm transition-colors',
                  isSelected ? 'border-ink bg-ink/[0.06]' : 'border-line bg-surface hover:border-ink',
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(tile.id)}
                  aria-pressed={isSelected}
                  className="flex min-w-0 flex-1 items-center gap-md text-left"
                >
                  <span className="flex size-chip shrink-0 items-center justify-center rounded-sm bg-surface-2 text-ink">
                    <Icon aria-hidden="true" className="size-[16px]" />
                  </span>
                  <span className="truncate text-body font-medium text-ink">{tile.label}</span>
                </button>
                <div className="flex shrink-0 items-center gap-xs">
                  <button
                    type="button"
                    aria-label={`Move ${tile.label} up`}
                    disabled={index === 0}
                    onClick={() => move(tile.id, -1)}
                    className="flex size-[24px] items-center justify-center rounded-sm text-ink-dim hover:text-ink disabled:pointer-events-none disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${tile.label} down`}
                    disabled={index === visible.length - 1}
                    onClick={() => move(tile.id, 1)}
                    className="flex size-[24px] items-center justify-center rounded-sm text-ink-dim hover:text-ink disabled:pointer-events-none disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Rename ${tile.label}`}
                    onClick={() => setEditingId(tile.id)}
                    className="flex size-[24px] items-center justify-center rounded-sm text-ink-dim hover:text-ink"
                  >
                    <Pencil aria-hidden="true" className="size-[13px]" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Hide ${tile.label}`}
                    onClick={() => actions.hideTile(tile.id)}
                    className="flex size-[24px] items-center justify-center rounded-sm text-ink-dim hover:text-ink"
                  >
                    <X aria-hidden="true" className="size-[13px]" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${tile.label}`}
                    onClick={() => void handleDelete(tile.id)}
                    className="flex size-[24px] items-center justify-center rounded-sm text-ink-dim hover:text-ink"
                  >
                    <Trash2 aria-hidden="true" className="size-[13px]" />
                  </button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {adding ? (
        <TileForm
          onSave={(label, iconKey) => {
            const created = actions.addTile(label, iconKey)
            onSelect(created.id)
            setAdding(false)
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <Button variant="outline" size="inline" onClick={() => setAdding(true)} className="self-start px-md py-sm">
          <Plus aria-hidden="true" className="size-[14px]" />
          <span>Add tile</span>
        </Button>
      )}

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
