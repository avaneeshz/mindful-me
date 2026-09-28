import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { REFLECTION_CARDS } from '@/data/reflectionCards'
import type { ScheduledActivity } from '@/domain/types'
import { Button } from '@/lumen/components/ui/button'
import { useStore } from '@/lumen/lib/store'
import { cn } from '@/lumen/lib/utils'

const cardByNumber = new Map(REFLECTION_CARDS.map((c) => [c.number, c]))

/**
 * Reflection cards on one logged activity — any number, each with its own
 * note (same many-to-many shape as Classic's Reflection grid). Changes apply
 * straight away, as their own writes, exactly like Classic: a reflection is
 * a separate, later act from logging the activity.
 */
export function ReflectionsSection({ activity }: { activity: ScheduledActivity }) {
  const { data } = useStore()
  // null = closed; a number = editing that card's note; 'pick' = choosing a card.
  const [open, setOpen] = useState<null | 'pick' | number>(null)
  const [note, setNote] = useState('')
  const mapped = activity.reflections

  function edit(card: number) {
    setNote(mapped.find((r) => r.card === card)?.note ?? '')
    setOpen(card)
  }

  return (
    <section aria-label="Reflections" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-ink-muted">Reflections</p>
        {open === null && (
          <Button variant="ghost" className="-mr-2 h-9 px-3 text-accent-ink" onClick={() => setOpen('pick')}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        )}
      </div>

      {mapped.length === 0 && open === null && (
        <p className="text-sm text-ink-faint">Pair a reflection card with this entry to note what came up.</p>
      )}

      {mapped.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {mapped.map((r) => {
            const card = cardByNumber.get(r.card)
            if (!card) return null
            return (
              <li key={r.card}>
                <button
                  type="button"
                  onClick={() => edit(r.card)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-control border px-2 py-2 text-left transition-colors',
                    open === r.card ? 'border-accent-ink/50 bg-accent/[0.08]' : 'border-line/[0.07] bg-white/[0.02] hover:bg-white/[0.04]',
                  )}
                >
                  <img src={card.image} alt="" className="h-10 w-10 shrink-0 rounded-[10px] object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-ink">{card.title}</span>
                    <span className="block truncate text-xs text-ink-muted">{r.note || 'No note'}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {open === 'pick' && (
        <div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {REFLECTION_CARDS.map((card) => {
              const already = mapped.some((r) => r.card === card.number)
              return (
                <button
                  key={card.number}
                  type="button"
                  onClick={() => edit(card.number)}
                  aria-label={`${card.title}${already ? ', already added' : ''}`}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-tile border p-2 text-center transition-colors',
                    already ? 'border-accent-ink/40 bg-accent/[0.08]' : 'border-line/[0.07] bg-white/[0.02] hover:bg-white/[0.05]',
                  )}
                >
                  <img src={card.image} alt="" className="aspect-square w-full rounded-[10px] object-cover" />
                  <span className="text-xs leading-4 text-ink">{card.title}</span>
                </button>
              )
            })}
          </div>
          <Button variant="ghost" className="mt-2 h-10 w-full" onClick={() => setOpen(null)}>
            Cancel
          </Button>
        </div>
      )}

      {typeof open === 'number' && (
        <div className="flex flex-col gap-2 rounded-tile border border-line/[0.09] bg-surface-2/40 p-3">
          <div className="flex items-center gap-2">
            <p className="flex-1 text-sm font-medium text-ink">{cardByNumber.get(open)?.title}</p>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(null)}
              className="grid h-9 w-9 place-items-center rounded-full text-ink-faint hover:bg-white/[0.06] hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <textarea
            value={note}
            rows={3}
            placeholder="What came up?"
            aria-label={`Note for ${cardByNumber.get(open)?.title ?? 'card'}`}
            onChange={(e) => setNote(e.target.value)}
            className="resize-y rounded-control border border-line/[0.09] bg-surface-1 px-3 py-2.5 text-[15px] text-ink placeholder:text-ink-faint focus-visible:border-accent-ink/60"
          />
          <div className="flex items-center gap-2">
            {mapped.some((r) => r.card === open) && (
              <Button
                variant="ghost"
                className="h-10"
                onClick={() => {
                  data.removeReflection(activity.id, open)
                  setOpen(null)
                }}
              >
                Remove
              </Button>
            )}
            <Button
              variant="primary"
              className="ml-auto h-10"
              onClick={() => {
                data.setReflection(activity.id, open, note.trim())
                setOpen(null)
              }}
            >
              Save
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
