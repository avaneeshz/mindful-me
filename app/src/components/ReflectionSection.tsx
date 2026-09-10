import type { ReactNode } from 'react'
import { Check, X } from 'lucide-react'
import { REFLECTION_CARDS } from '@/data/reflectionCards'
import { REFLECTION_CARD_MIME } from '@/domain/reflectionDrag'
import { formatActivityRange } from '@/domain/slots'
import type { ActivityList, ScheduledActivity } from '@/domain/types'
import { Chip } from '@/components/ui/chip'
import { cn } from '@/lib/utils'

/**
 * The home-screen reflection section — a static-positioned section below the
 * tile row/timeline editor (never inside the log-activity modal: mapping a
 * reflection card is its own, later action, potentially hours after an
 * activity was logged — see the full-stack-engineer agent definition's
 * revision notes). Two rows of nine cards, same catalog and layout the old
 * static prototype (`data/reflectionCards.ts`) used — now genuinely
 * interactive:
 *
 *   - Click a card while an activity is selected on the timeline
 *     (`selectedActivityId`) to map it (opens the note-entry popup the
 *     caller owns — `onRequestMapping`).
 *   - Drag a card directly onto an activity's own timeline segment — no
 *     prior selection needed, since the drop target IS the activity (see
 *     `Timeline.tsx`'s `onDropReflectionCard`).
 *
 * When an activity is selected, its own read-only details summary (quality,
 * chronic symptoms, protective response, notes, and reflection cards already
 * mapped) shows above the grid, and every card already mapped to it is
 * outlined here too, so re-clicking one reopens the popup to edit or remove
 * that one note rather than only ever adding.
 */
export function ReflectionSection({
  activities,
  selectedActivityId,
  onRequestMapping,
  onDeselect,
}: {
  activities: ActivityList
  selectedActivityId: string | null
  /** Click path — the caller (`TodayPage`) only acts on this when an activity is actually selected. */
  onRequestMapping: (card: number) => void
  onDeselect: () => void
}) {
  const selected = selectedActivityId ? activities.find((a) => a.id === selectedActivityId) ?? null : null
  const mappedCards = new Set(selected?.reflections.map((r) => r.card) ?? [])

  return (
    <section
      aria-labelledby="reflection-heading"
      className="rounded-lg border border-line bg-surface p-2xl shadow-elevation-1 mobile:p-lg ipad-land:p-lg"
    >
      <h2 id="reflection-heading" className="font-display text-slot-time font-semibold text-ink">
        Reflection
      </h2>

      {selected ? (
        <SelectedActivitySummary activity={selected} onClose={onDeselect} />
      ) : (
        <p className="mt-md text-caption text-ink-dim">
          Select an activity on the timeline, or drag a card below onto one, to map it.
        </p>
      )}

      <div
        role="group"
        aria-label="Reflection cards"
        className="mt-xl grid grid-cols-9 gap-md mobile:mt-lg mobile:grid-cols-3 mobile:gap-sm"
      >
        {REFLECTION_CARDS.map((card) => {
          const isMapped = mappedCards.has(card.number)
          return (
            <button
              key={card.number}
              type="button"
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData(REFLECTION_CARD_MIME, String(card.number))
                event.dataTransfer.effectAllowed = 'copy'
              }}
              onClick={() => onRequestMapping(card.number)}
              aria-pressed={isMapped}
              aria-label={isMapped ? `${card.title} — already mapped to ${selected?.name}, edit or remove` : card.title}
              className={cn(
                'relative flex flex-col overflow-hidden rounded-md border bg-surface text-left transition-colors',
                isMapped ? 'border-ink ring-2 ring-ink' : 'border-line hover:border-ink hover:shadow-elevation-2',
              )}
            >
              <div className="aspect-[4/3] w-full overflow-hidden bg-surface-2">
                <img src={card.image} alt="" className="size-full object-cover" />
              </div>
              <p className="border-t border-line px-sm py-sm text-center text-note font-semibold leading-snug text-ink">
                {card.title}
              </p>
              {isMapped && (
                <span
                  aria-hidden="true"
                  className="absolute right-xs top-xs flex size-[20px] items-center justify-center rounded-full bg-inv-bg text-inv-ink"
                >
                  <Check className="size-[13px]" />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}

/** Read-only — quality/symptoms/protective response/notes/reflections already stored for the selected activity. */
function SelectedActivitySummary({ activity, onClose }: { activity: ScheduledActivity; onClose: () => void }) {
  const label = `${activity.name}${activity.path.length ? ` ${activity.path.join(' ')}` : ''}`

  return (
    <div className="mt-md rounded-md border border-line bg-bg p-md">
      <div className="flex items-start justify-between gap-md">
        <div>
          <p className="text-entry-name font-semibold text-ink">{label}</p>
          <p className="text-caption text-ink-dim">
            {formatActivityRange(activity.startMinutes, activity.durationMinutes)}
            {activity.status === 'completed' && ' · Completed'}
          </p>
        </div>
        <button
          type="button"
          aria-label="Deselect activity"
          onClick={onClose}
          className="flex size-stepper shrink-0 items-center justify-center rounded-full text-ink-dim transition-colors hover:bg-surface hover:text-ink"
        >
          <X aria-hidden="true" className="size-[16px]" />
        </button>
      </div>

      {activity.quality.length > 0 && (
        <SummaryRow label="Activity quality">
          {activity.quality.map((q) => (
            <Chip key={q} size="xs" tone="surface">
              {q}
            </Chip>
          ))}
        </SummaryRow>
      )}

      {activity.symptoms.length > 0 && (
        <SummaryRow label="Chronic symptoms">
          {activity.symptoms.map((s) => (
            <Chip key={s} size="xs" tone="surface">
              {s}
            </Chip>
          ))}
        </SummaryRow>
      )}

      {activity.flags.length > 0 && (
        <SummaryRow label="Protective response">
          {activity.flags.map((f) => (
            <Chip key={f} size="xs" tone="surface">
              {f}
            </Chip>
          ))}
        </SummaryRow>
      )}

      {activity.notes && (
        <div className="mt-sm">
          <p className="text-nano font-semibold uppercase tracking-tag text-ink-dim">Notes</p>
          <p className="mt-xs text-note text-ink">{activity.notes}</p>
        </div>
      )}

      {activity.reflections.length > 0 && (
        <div className="mt-sm">
          <p className="text-nano font-semibold uppercase tracking-tag text-ink-dim">Reflection cards</p>
          <ul className="mt-xs flex flex-col gap-xs">
            {activity.reflections.map((r) => {
              const card = REFLECTION_CARDS.find((c) => c.number === r.card)
              return (
                <li key={r.card} className="text-note text-ink">
                  <span className="font-semibold">{card?.title ?? `Card ${r.card}`}</span>
                  {r.note && <span className="text-ink-dim"> — {r.note}</span>}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-sm">
      <p className="text-nano font-semibold uppercase tracking-tag text-ink-dim">{label}</p>
      <div className="mt-xs flex flex-wrap gap-xs">{children}</div>
    </div>
  )
}
