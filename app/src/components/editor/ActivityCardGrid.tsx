import { ArrowLeft, ArrowRight, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { colorTintStyle } from '@/components/ui/colorStyles'
import { REORDER_ITEM_ATTR, useSelectableReorder } from '@/components/ui/useSelectableReorder'
import { moveInOrder, type ActivityRow } from '@/domain/pickerHierarchy'
import { resolveIcon } from '@/lib/iconRegistry'
import { cn } from '@/lib/utils'

const LANE = 'activities'

const badge =
  'absolute top-xs z-10 flex size-[24px] items-center justify-center rounded-full border border-line bg-surface text-ink-dim transition-colors hover:bg-inv-bg hover:text-inv-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

/**
 * A tile's activities as square cards, laid out like the tile row. Tap a card
 * to select it, then drag to reorder (the same select-and-drag the tiles and
 * header buttons use). Selecting one card also offers Move earlier / later —
 * the tap equivalent of dragging. The pencil opens that activity's editor; the
 * bin hides it.
 */
export function ActivityCardGrid({
  rows,
  emptyText,
  colorFor,
  onOpen,
  onReorder,
  onHide,
}: {
  rows: ActivityRow[]
  emptyText: string
  colorFor?: (row: ActivityRow) => string | null
  onOpen: (id: string) => void
  onReorder: (orderedIds: string[]) => void
  onHide: (id: string) => void
}) {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const { lanes, draggingId, draggingIds, itemProps, laneRef, isSelected, wobbles, toggleSelected, selectedIds } = useSelectableReorder({
    lanes: [{ groupId: LANE, buttonIds: rows.map((r) => r.id) }],
    enabled: true,
    onCommit: (layout) => onReorder(layout[0]!.buttonIds),
  })

  if (rows.length === 0) return <p className="text-caption text-ink-dim">{emptyText}</p>

  const ordered = (lanes[0]?.buttonIds ?? []).flatMap((id) => byId.get(id) ?? [])
  const orderedIds = ordered.map((r) => r.id)
  const single = selectedIds.length === 1 ? selectedIds[0]! : null
  const position = single ? orderedIds.indexOf(single) : -1
  const move = (delta: -1 | 1) => {
    if (!single) return
    const next = moveInOrder(orderedIds, single, delta)
    if (next) onReorder(next)
  }

  return (
    <div className="flex flex-col gap-sm">
      <div ref={laneRef(LANE)} className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-sm">
        {ordered.map((row, index) => {
          const Icon = resolveIcon(row.iconKey)
          const drag = itemProps(row.id)
          const selected = isSelected(row.id)
          const dragging = draggingId === row.id
          const inGroupDrag = draggingIds.length > 1 && draggingIds.includes(row.id)
          return (
            <div
              key={row.id}
              ref={drag.ref}
              onPointerDown={drag.onPointerDown}
              style={drag.style}
              data-dragging={drag['data-dragging']}
              {...{ [REORDER_ITEM_ATTR]: '' }}
              aria-roledescription="draggable activity"
              className={cn('relative min-w-0 select-none rounded-lg', (selected || dragging) && 'shadow-elevation-2', inGroupDrag && 'opacity-40')}
            >
              <div
                className={cn('rounded-lg', wobbles(row.id) && 'animate-jiggle')}
                style={{ animationDelay: `${-(index % 4) * 0.07 - (index % 3) * 0.05}s` }}
              >
                <button
                  type="button"
                  aria-label={`${row.name} — select to move`}
                  aria-pressed={selected}
                  // A press is handled by the wrapper (tap selects, drag moves); a click with no pointer is the keyboard.
                  onClick={(event) => {
                    if (event.detail === 0) toggleSelected(row.id)
                  }}
                  className={cn(
                    'relative flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-sm overflow-hidden',
                    'rounded-lg border bg-bg p-sm transition-colors hover:border-ink',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                    selected ? 'border-ink shadow-[0_0_0_1px_var(--ink)]' : 'border-line',
                  )}
                  style={colorTintStyle(colorFor?.(row) ?? null, { border: !selected })}
                >
                  <Icon aria-hidden="true" className="size-[20px] shrink-0 text-ink" />
                  <span aria-hidden="true" className="line-clamp-2 w-full px-xs text-center text-micro font-bold leading-tight text-ink">
                    {row.name}
                  </span>
                </button>
              </div>
              <span data-reorder-ignore="">
                <button type="button" aria-label={`Edit ${row.name}`} onClick={() => onOpen(row.id)} className={cn(badge, 'left-xs')}>
                  <Pencil aria-hidden="true" className="size-[12px]" />
                </button>
                <button type="button" aria-label={`Hide ${row.name}`} onClick={() => onHide(row.id)} className={cn(badge, 'right-xs')}>
                  <Trash2 aria-hidden="true" className="size-[12px]" />
                </button>
              </span>
            </div>
          )
        })}
      </div>

      {single && (
        <div {...{ [REORDER_ITEM_ATTR]: '' }} role="group" aria-label="Position" className="flex items-center justify-between gap-sm">
          <span className="text-caption text-ink-dim">
            {byId.get(single)?.name} · {position + 1} of {orderedIds.length}
          </span>
          <span className="flex items-center gap-xs">
            <Button type="button" variant="outline" aria-label="Move earlier" disabled={position <= 0} onClick={() => move(-1)}>
              <ArrowLeft aria-hidden="true" className="size-[14px]" />
            </Button>
            <Button type="button" variant="outline" aria-label="Move later" disabled={position === orderedIds.length - 1} onClick={() => move(1)}>
              <ArrowRight aria-hidden="true" className="size-[14px]" />
            </Button>
          </span>
        </div>
      )}
    </div>
  )
}
