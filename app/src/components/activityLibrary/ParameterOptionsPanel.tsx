import { useState } from 'react'
import { Loader2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { cn } from '@/lib/utils'
import type { ParameterType } from '@/api/parameterOptions'
import type { UseActivityParameterSelectionsResult } from '@/state/useActivityParameterSelections'

const SECTIONS: { type: ParameterType; label: string; helper: string }[] = [
  { type: 'quality', label: 'Activity quality', helper: 'Which of your quality options apply to this activity.' },
  { type: 'symptom', label: 'Chronic symptoms', helper: 'Which of your symptom options apply to this activity.' },
  { type: 'flag', label: 'Protective response', helper: 'Which of your protective-response options apply — a single tag per log.' },
]

/**
 * One activity's own checklist against the shared global vocabulary
 * (PICKER-CUSTOM-1 pivot — see `useActivityParameterSelections`'s own doc
 * comment). Every global option gets a real checkbox row here — checked
 * means it's currently effective for this activity, whether that's because
 * this activity explicitly chose it or because it's inheriting the full
 * list/an ancestor's own choices. No free-text entry here at all any more;
 * that only ever happens in `ParameterVocabularyPanel`, the dialog's
 * "nothing selected yet" state in the same column (`ActivityLibraryPanel`'s
 * own doc comment covers the reachability call behind that). `onManageVocabulary`
 * (found in code review) is this checklist's own way back to it without
 * hunting for how to deselect the activity — used both as a persistent link
 * and, pointedly, in a section's own empty state when its global list has
 * nothing in it yet at all.
 */
export function ParameterOptionsPanel({
  activityName,
  data,
  onManageVocabulary,
}: {
  activityName: string
  data: UseActivityParameterSelectionsResult
  onManageVocabulary: () => void
}) {
  return (
    <section aria-label="Parameter options" className="flex flex-col gap-lg">
      <div className="flex items-center justify-between gap-md">
        <h2 className="text-btn font-semibold text-ink">Options for &quot;{activityName}&quot;</h2>
        {data.status === 'loading' && <Loader2 aria-hidden="true" className="size-[16px] animate-spin text-ink-dim" />}
      </div>
      <Button variant="accent" size="inline" onClick={onManageVocabulary} className="self-start">
        Manage your options
      </Button>
      {data.error && <p className="text-caption text-ink-dim">{data.error}</p>}

      {SECTIONS.map((section) => (
        <ChecklistSection key={section.type} section={section} data={data} onManageVocabulary={onManageVocabulary} />
      ))}
    </section>
  )
}

function ChecklistSection({
  section,
  data,
  onManageVocabulary,
}: {
  section: (typeof SECTIONS)[number]
  data: UseActivityParameterSelectionsResult
  onManageVocabulary: () => void
}) {
  // Which single checkbox has an in-flight toggle, if any — scoped to just
  // that row (found in review on an earlier round of this same panel: a
  // single section-wide "busy" flag blocked every OTHER checkbox in the
  // section while one toggle was in flight, which reads as an unresponsive
  // click rather than a real double-submit guard). "Reset to inherited"
  // still gets its own separate flag, same reasoning.
  const [pendingOptionId, setPendingOptionId] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)
  const [rowError, setRowError] = useState<string | null>(null)

  const options = data.byType[section.type]
  const overridden = data.isOwn[section.type]
  const selectedCount = options.filter((o) => o.selected).length

  async function handleToggle(optionId: string, nextSelected: boolean) {
    if (pendingOptionId || resetting) return
    // Never let an activity narrow itself to zero selected options for a
    // type from this control — found in code review: the underlying model
    // can't actually represent "explicitly zero" (a real activity with own
    // selection rows and a real activity that's never been customized both
    // read the exact same way once its own row count hits zero — see
    // `20260925070000_parameter_options_global_vocabulary.sql`'s own doc
    // comment on `activity_parameter_selections`), so unchecking the very
    // last box wouldn't stay unchecked — the next load would silently show
    // the FULL list checked again, with no explanation. The old, now-replaced
    // per-activity override model guarded this exact same edge case in this
    // exact same component for the exact same underlying reason.
    if (!nextSelected && selectedCount <= 1) {
      setRowError(
        `This activity can’t show zero ${section.label.toLowerCase()} options — check a different option to replace it first.`,
      )
      return
    }
    setRowError(null)
    setPendingOptionId(optionId)
    try {
      const result = await data.toggle(section.type, optionId, nextSelected)
      if (!result.ok) {
        setRowError('Could not save this right now — try again once you’re back online.')
      }
    } finally {
      setPendingOptionId(null)
    }
  }

  async function handleReset() {
    if (pendingOptionId || resetting) return
    setRowError(null)
    setResetting(true)
    try {
      const result = await data.resetToInherited(section.type)
      if (!result.ok) {
        setRowError('Could not reset this right now — try again once you’re back online.')
      }
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="flex flex-col gap-sm rounded-md border border-line-soft bg-bg p-md">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div>
          <h3 className="text-body font-semibold text-ink">{section.label}</h3>
          <p className="text-caption text-ink-dim">{section.helper}</p>
        </div>
        <span className="text-caption text-ink-dim">{overridden ? 'Customized for this activity' : 'Inherited'}</span>
      </div>

      {/*
        Found in code review: this used to say "add some in 'Your options'
        above" — but that section is never on screen AT THE SAME TIME as
        this checklist (they're alternates in the same dialog column, see
        `ActivityLibraryPanel`), so the instruction was unfollowable without
        first figuring out how to get back there. A real button that does it
        for you, instead.
      */}
      {data.status === 'ready' && options.length === 0 && (
        <p className="text-caption text-ink-dim">
          No {section.label.toLowerCase()} options exist yet.{' '}
          <Button variant="accent" size="inline" onClick={onManageVocabulary}>
            Add some
          </Button>
        </p>
      )}

      <ul className="flex flex-wrap gap-xs" aria-label={`${section.label} checklist`}>
        {options.map((option) => {
          const isPending = pendingOptionId === option.optionId
          const disabled = resetting || (pendingOptionId !== null && !isPending)
          return (
            <li key={option.optionId}>
              {/* `Chip`'s prop type doesn't include a real `disabled` (it's
                  typed as generic `HTMLAttributes`, not `ButtonHTMLAttributes`
                  — see that component's own props type) — `aria-disabled` +
                  guarding the click handler itself gives the same effect
                  without fighting that type. */}
              <Chip
                as="button"
                size="xs"
                tone={option.selected ? 'active' : 'surface'}
                interactive={!disabled}
                role="checkbox"
                aria-checked={option.selected}
                aria-disabled={disabled}
                onClick={() => {
                  if (disabled) return
                  void handleToggle(option.optionId, !option.selected)
                }}
                className={cn(disabled && 'pointer-events-none opacity-50')}
              >
                {isPending && <Loader2 aria-hidden="true" className="size-[10px] animate-spin" />}
                <span>{option.label}</span>
              </Chip>
            </li>
          )
        })}
      </ul>

      {rowError && (
        <p role="alert" className="text-caption text-ink-dim">
          {rowError}
        </p>
      )}

      {overridden && (
        <Button
          variant="ghost"
          size="inline"
          disabled={pendingOptionId !== null || resetting}
          onClick={() => void handleReset()}
          className="self-start"
        >
          {resetting ? <Loader2 aria-hidden="true" className="size-[13px] animate-spin" /> : <RotateCcw aria-hidden="true" className="size-[13px]" />}
          <span>Reset to inherited</span>
        </Button>
      )}
    </div>
  )
}
