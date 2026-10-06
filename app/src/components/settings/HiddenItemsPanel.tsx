import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EyeOff, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { activityPathNames, tileIdForActivity } from '@/domain/pickerHierarchy'
import { usePickerData } from '@/state/PickerDataContext'
import { useSharedHeaderButtons } from '@/state/HeaderButtonsContext'

type DeleteResult = { ok: true } | { ok: false; reason: 'has_history' | 'unreachable' }

interface HiddenItem {
  id: string
  label: string
  onRestore: () => void
  /** Present only where a permanent delete is allowed (tiles, activities). */
  onDelete?: () => Promise<DeleteResult>
}

/** Anchor id Settings scrolls to when arriving from a "restore in Settings" link. */
export const HIDDEN_ITEMS_ANCHOR = 'hidden'

/**
 * Settings → "Hidden items": the ONE place anything hidden from Today comes
 * back from — header buttons, tiles, and activities at any depth. Replaces
 * the per-surface "Hidden" boxes that used to sit inside the header's edit
 * mode and each tile/activity editor. Works through the shared hooks only.
 */
export function HiddenItemsPanel() {
  const headerButtons = useSharedHeaderButtons()
  const { tiles, activities } = usePickerData()

  const tileLabel = (tileId: string | null) => tiles.tiles.find((t) => t.id === tileId)?.label

  const buttonItems: HiddenItem[] = headerButtons.hidden.map((button) => ({
    id: button.id,
    label: button.label,
    onRestore: () => headerButtons.unhideButton(button.id),
  }))

  const tileItems: HiddenItem[] = tiles.tiles
    .filter((tile) => tile.hidden)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((tile) => ({
      id: tile.id,
      label: tile.label,
      onRestore: () => tiles.unhideTile(tile.id),
      onDelete: () => tiles.deleteTile(tile.id),
    }))

  const activityItems: HiddenItem[] = activities.activities
    .filter((row) => row.hidden)
    .map((row) => {
      const path = activityPathNames(activities.activities, row.id)
      const tile = tileLabel(tileIdForActivity(activities.activities, row.id))
      return {
        id: row.id,
        label: [tile, ...path].filter(Boolean).join(' → '),
        onRestore: () => activities.unhideActivity(row.id),
        onDelete: () => activities.deleteActivity(row.id),
      }
    })
    .sort((a, b) => a.label.localeCompare(b.label))

  const loading = tiles.status === 'loading' || activities.status === 'loading' || headerButtons.status === 'loading'
  const total = buttonItems.length + tileItems.length + activityItems.length

  return (
    <div className="flex flex-col gap-lg">
      <div>
        <h2 id="hidden-heading" className="text-body font-semibold text-ink">
          Hidden items
        </h2>
        <p className="mt-xs text-caption text-ink-dim">
          Anything you hide from Today waits here. Restore puts it back exactly where it was.
        </p>
      </div>

      {total === 0 ? (
        <div className="flex items-center gap-sm rounded-md border border-dashed border-line px-md py-lg text-caption text-ink-dim">
          <EyeOff aria-hidden="true" className="size-[16px] shrink-0" />
          {loading ? 'Loading…' : 'Nothing is hidden.'}
        </div>
      ) : (
        <>
          <HiddenGroup title="Header buttons" items={buttonItems} />
          <HiddenGroup title="Tiles" items={tileItems} />
          <HiddenGroup title="Activities" items={activityItems} />
        </>
      )}
    </div>
  )
}

function HiddenGroup({ title, items }: { title: string; items: HiddenItem[] }) {
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (items.length === 0) return null

  async function remove(item: HiddenItem) {
    if (!item.onDelete) return
    setError(null)
    setPendingId(item.id)
    const result = await item.onDelete()
    setPendingId(null)
    setConfirmId(null)
    if (!result.ok) {
      setError(
        result.reason === 'has_history'
          ? `“${item.label}” has logged history, so it stays hidden instead of being deleted.`
          : 'Could not delete right now. Try again once you’re back online.',
      )
    }
  }

  return (
    <section aria-label={`Hidden ${title.toLowerCase()}`} className="flex flex-col gap-sm">
      <h3 className="text-nano font-semibold uppercase tracking-tag text-ink-dim">
        {title} <span className="font-normal">· {items.length}</span>
      </h3>
      <ul className="flex flex-col divide-y divide-line-soft rounded-md border border-line">
        {items.map((item) => (
          <li key={item.id} className="flex min-h-[48px] items-center gap-sm py-xs pl-md pr-xs">
            <span className="min-w-0 flex-1 truncate text-body text-ink">{item.label}</span>
            {confirmId === item.id ? (
              <>
                <span className="text-caption text-ink-dim mobile:hidden">Delete for good?</span>
                <Button
                  variant="destructive"
                  size="inline"
                  disabled={pendingId === item.id}
                  onClick={() => void remove(item)}
                >
                  {pendingId === item.id ? 'Deleting…' : 'Delete'}
                </Button>
                <Button
                  variant="accent"
                  size="inline"
                  disabled={pendingId === item.id}
                  onClick={() => setConfirmId(null)}
                >
                  Keep
                </Button>
              </>
            ) : (
              <>
                <Button variant="accent" size="inline" onClick={item.onRestore}>
                  Restore
                </Button>
                {item.onDelete && (
                  <button
                    type="button"
                    aria-label={`Delete ${item.label} permanently`}
                    onClick={() => setConfirmId(item.id)}
                    className="flex size-[32px] items-center justify-center rounded-md text-ink-dim transition-colors hover:bg-bg hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
                  >
                    <Trash2 aria-hidden="true" className="size-[14px]" />
                  </button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-caption text-ink-dim">
          {error}
        </p>
      )}
    </section>
  )
}

/**
 * The small pointer left behind wherever a "Hidden" box used to live —
 * hiding is never a dead end, and the way back is always the same place.
 */
export function HiddenInSettingsLink({ count, noun }: { count: number; noun: string }) {
  if (count === 0) return null
  return (
    <Link
      to={`/settings#${HIDDEN_ITEMS_ANCHOR}`}
      className="self-start text-caption font-semibold text-ink-dim underline-offset-2 transition-colors hover:text-ink hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      {count} hidden {noun}
      {count === 1 ? '' : 's'} · restore in Settings
    </Link>
  )
}
