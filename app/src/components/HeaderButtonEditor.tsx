import { useEffect, useId, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { AlignLeft, Eye, ListChecks, Pencil, Plus, X } from 'lucide-react'
import { Chip, chipVariants } from '@/components/ui/chip'
import { Button } from '@/components/ui/button'
import {
  HEADER_BUTTON_CATEGORIES,
  headerButtonCategoryLabel,
  isBlank,
  type HeaderButtonCategory,
  type HeaderButtonConfig,
} from '@/domain/headerButtons'
import type { CreateHeaderButtonInput, HeaderButtonNoteFieldInput, UpdateHeaderButtonInput } from '@/api/headerButtons'
import { ACTIVITY_CARDS, findCard, firstLevelOptionNames } from '@/data/activities'
import { catalogIdForName } from '@/api/catalog'
import { fieldClass, labelClass } from '@/components/ui/formField'
import { cn } from '@/lib/utils'

/** The max number of `'text'`-kind fields a button may carry — the physical
 * column limit (`scheduled_activities.notes_encrypted`/`dreams_encrypted`),
 * see `domain/headerButtons.ts`'s own doc comment. `'multiselect'` fields
 * are never capped (proper child-table storage). */
const MAX_TEXT_FIELDS = 2

/** One field row's in-progress local shape — `id` is present only for a
 * field that already exists on the server (carried through unchanged so a
 * later edit preserves its `scheduled_activity_field_selections` history);
 * a brand-new field has no `id` yet and the server assigns one on save. */
interface FieldDraft {
  id?: string
  fieldKind: 'text' | 'multiselect'
  key: 'primary' | 'secondary' | null
  label: string
  options: string[]
}

/**
 * The header/home-screen "edit mode" toggle and everything it turns on —
 * per-button remove/edit affordances, the "add a button" chip, the add/edit
 * form itself, and the hidden-buttons panel. Deliberately NOT a separate
 * settings page (the product owner's explicit request) — every affordance
 * here lives directly in the header row it edits, a phone-home-screen-
 * widget-edit-mode shape rather than a menu buried elsewhere.
 *
 * Every `header_buttons` row a user has is unconditionally theirs (see
 * `domain/headerButtons.ts`'s own doc comment) — there is no "shared
 * default, can't edit in place" distinction anywhere here. The add/edit
 * form below is the same form whether the button being edited came from
 * this user's own initial provisioning or was added by hand afterward.
 */

export function EditModeToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={active ? 'Done editing header buttons' : 'Edit header buttons'}
      onClick={onToggle}
      className={cn(
        chipVariants({ tone: active ? 'active' : 'surface', size: 'sm', interactive: true }),
        'font-semibold',
      )}
    >
      {active ? <X aria-hidden="true" className="size-[14px]" /> : <Pencil aria-hidden="true" className="size-[14px]" />}
      <span>{active ? 'Done' : 'Edit'}</span>
    </button>
  )
}

/** The small Edit/Remove overlay a button wears in edit mode — a phone-home-screen-widget shape, not a hover-only affordance (so it works on touch too). */
export function EditModeControls({
  button,
  onEdit,
  onHide,
}: {
  button: HeaderButtonConfig
  onEdit: () => void
  onHide: () => void
}) {
  return (
    <span className="absolute -right-xs -top-xs z-10 flex gap-[2px]">
      <button
        type="button"
        aria-label={`Edit ${button.label}`}
        onClick={onEdit}
        className="flex size-[20px] items-center justify-center rounded-full border border-line bg-surface text-ink-dim shadow-elevation-1 transition-colors hover:bg-bg hover:text-ink"
      >
        <Pencil aria-hidden="true" className="size-[11px]" />
      </button>
      <button
        type="button"
        aria-label={`Remove ${button.label}`}
        onClick={onHide}
        className="flex size-[20px] items-center justify-center rounded-full border border-line bg-surface text-ink-dim shadow-elevation-1 transition-colors hover:bg-bg hover:text-ink"
      >
        <X aria-hidden="true" className="size-[11px]" />
      </button>
    </span>
  )
}

export function AddHeaderButtonChip({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Add a header button"
      onClick={onClick}
      className={cn(
        chipVariants({ tone: 'surface', size: 'sm', interactive: true }),
        'border-dashed font-semibold text-ink-dim hover:text-ink',
      )}
    >
      <Plus aria-hidden="true" className="size-[14px]" />
      <span>Add button</span>
    </button>
  )
}

export function HiddenButtonsPanel({
  hidden,
  onUnhide,
}: {
  hidden: readonly HeaderButtonConfig[]
  onUnhide: (id: string) => void
}) {
  if (hidden.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-sm rounded-md border border-dashed border-line p-sm">
      <span className="text-caption font-semibold text-ink-dim">Hidden:</span>
      {hidden.map((button) => (
        <button
          key={button.id}
          type="button"
          aria-label={`Unhide ${button.label}`}
          onClick={() => onUnhide(button.id)}
          className={cn(chipVariants({ tone: 'bare', size: 'xs', interactive: true }), 'text-ink-dim hover:text-ink')}
        >
          <Eye aria-hidden="true" className="size-[12px]" />
          <span>{button.label}</span>
        </button>
      ))}
    </div>
  )
}

type FormMode = { kind: 'add' } | { kind: 'edit'; button: HeaderButtonConfig }

export function HeaderButtonFormDialog({
  mode,
  onClose,
  onCreate,
  onUpdate,
}: {
  mode: FormMode
  onClose: () => void
  onCreate: (input: Omit<CreateHeaderButtonInput, 'id'>) => void
  onUpdate: (input: UpdateHeaderButtonInput & { category: HeaderButtonCategory }) => void
}) {
  const isEdit = mode.kind === 'edit'
  const existing = mode.kind === 'edit' ? mode.button : null

  const [category, setCategory] = useState<HeaderButtonCategory>(existing?.category ?? 'activity')
  const [label, setLabel] = useState(existing?.label ?? '')
  const [activityName, setActivityName] = useState(existing?.activityName ?? '')
  const [quickLogType, setQuickLogType] = useState(existing?.quickLogType ?? false)
  const [quickLogTypeLabel, setQuickLogTypeLabel] = useState(existing?.quickLogTypeLabel ?? 'Type')
  const [fields, setFields] = useState<FieldDraft[]>(
    (existing?.noteFields ?? []).map((f) => ({
      id: f.id,
      fieldKind: f.fieldKind,
      key: f.key,
      label: f.label,
      options: [...f.options],
    })),
  )
  const [isAddingField, setIsAddingField] = useState(false)
  const [draftKind, setDraftKind] = useState<'text' | 'multiselect'>('text')
  const [draftLabel, setDraftLabel] = useState('')
  const [draftOptions, setDraftOptions] = useState<string[]>([''])
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [dayValueUnit, setDayValueUnit] = useState<'min' | 'int' | 'target'>(existing?.dayValueUnit ?? 'int')
  const [dayValueTarget, setDayValueTarget] = useState(existing?.dayValueTarget?.toString() ?? '')
  const [noteTypesText, setNoteTypesText] = useState((existing?.noteTypes ?? []).join('\n'))
  const [checklistItemsText, setChecklistItemsText] = useState(
    (existing?.checklistItems ?? []).map((i) => i.label).join('\n'),
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const headingId = useId()

  useEffect(() => {
    if (typeof document === 'undefined') return
    // Focus the label field on open, same convention `LogActivityModal`/
    // `NoteButtonPill`'s Store form already use.
    const el = document.getElementById('header-button-label') as HTMLInputElement | null
    el?.focus()
  }, [])

  const typeOptions = category === 'activity' && activityName ? firstLevelOptionNames(findCard(activityName)) : []

  const textFieldCount = fields.filter((f) => f.fieldKind === 'text').length

  function openAddField(): void {
    setDraftKind(textFieldCount >= MAX_TEXT_FIELDS ? 'multiselect' : 'text')
    setDraftLabel('')
    setDraftOptions([''])
    setFieldError(null)
    setIsAddingField(true)
  }

  function cancelAddField(): void {
    setIsAddingField(false)
    setFieldError(null)
  }

  function confirmAddField(): void {
    if (isBlank(draftLabel)) {
      setFieldError('Give this field a title.')
      return
    }
    if (draftKind === 'text' && textFieldCount >= MAX_TEXT_FIELDS) {
      setFieldError(`Text notes are limited to ${MAX_TEXT_FIELDS} per button.`)
      return
    }
    const trimmedOptions = draftOptions.map((o) => o.trim()).filter((o) => o !== '')
    if (draftKind === 'multiselect' && trimmedOptions.length === 0) {
      setFieldError('Add at least one option.')
      return
    }
    const key: 'primary' | 'secondary' | null =
      draftKind === 'text' ? (fields.some((f) => f.key === 'primary') ? 'secondary' : 'primary') : null
    setFields([...fields, { fieldKind: draftKind, key, label: draftLabel.trim(), options: trimmedOptions }])
    setIsAddingField(false)
    setFieldError(null)
  }

  function removeField(index: number): void {
    setFields(fields.filter((_, i) => i !== index))
  }

  function updateDraftOption(index: number, value: string): void {
    setDraftOptions(draftOptions.map((o, i) => (i === index ? value : o)))
  }

  function removeDraftOption(index: number): void {
    setDraftOptions(draftOptions.filter((_, i) => i !== index))
  }

  function validate(): string | null {
    if (isBlank(label)) return 'Give this button a name.'
    if (!isEdit) {
      if (category === 'activity' && isBlank(activityName)) return 'Choose an activity to quick-log.'
      if (category === 'day_value' && dayValueUnit === 'target' && isBlank(dayValueTarget)) {
        return 'Set a daily target.'
      }
      if (category === 'checklist' && isBlank(checklistItemsText)) return 'Add at least one checklist item.'
    }
    if (category === 'day_value' && dayValueUnit === 'target' && isBlank(dayValueTarget)) {
      return 'Set a daily target.'
    }
    return null
  }

  async function handleSubmit(): Promise<void> {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    if (submitting) return
    setSubmitting(true)
    setError(null)

    const noteFields: HeaderButtonNoteFieldInput[] = fields.map((f) => ({
      id: f.id,
      fieldKind: f.fieldKind,
      key: f.key,
      label: f.label,
      options: f.fieldKind === 'multiselect' ? f.options : [],
    }))
    const noteTypes = noteTypesText
      .split('\n')
      .map((v) => v.trim())
      .filter((v) => v !== '')
    const checklistItems = checklistItemsText
      .split('\n')
      .map((v) => v.trim())
      .filter((v) => v !== '')
      .map((v) => ({ label: v }))

    if (isEdit) {
      onUpdate({
        id: existing!.id,
        category,
        label: label.trim(),
        quickLogTypeLabel: category === 'activity' ? quickLogTypeLabel.trim() || 'Type' : null,
        dayValueTarget: category === 'day_value' && dayValueUnit === 'target' ? Number(dayValueTarget) : null,
        noteFields: category === 'activity' ? noteFields : null,
        noteTypes: category === 'notes' ? noteTypes : null,
        checklistItems:
          category === 'checklist'
            ? checklistItems.map((item, index) => ({ key: existing!.checklistItems[index]?.key, label: item.label }))
            : null,
      })
      onClose()
      return
    }

    let activityId: string | null = null
    if (category === 'activity') {
      activityId = await catalogIdForName(activityName)
    }

    onCreate({
      category,
      label: label.trim(),
      activityId,
      entryMode: 'duration',
      quickLogType: category === 'activity' ? quickLogType : false,
      quickLogTypeLabel: category === 'activity' && quickLogType ? quickLogTypeLabel.trim() || 'Type' : null,
      dayValueUnit: category === 'day_value' ? dayValueUnit : null,
      dayValueTarget: category === 'day_value' && dayValueUnit === 'target' ? Number(dayValueTarget) : null,
      noteFields: category === 'activity' ? noteFields : [],
      noteTypes: category === 'notes' ? noteTypes : [],
      checklistItems: category === 'checklist' ? checklistItems : [],
    })
    onClose()
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-black/45" />
      <Dialog.Content
        aria-labelledby={headingId}
        className={cn(
          'fixed z-50 flex max-h-[85vh] flex-col gap-md overflow-y-auto bg-surface p-lg shadow-elevation-2 focus:outline-none',
          'inset-0 mobile:inset-0',
          'md:inset-auto md:left-1/2 md:top-1/2 md:w-[min(480px,92vw)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg',
        )}
      >
        <div className="flex items-start justify-between gap-md">
          <Dialog.Title id={headingId} className="text-h1-sm font-semibold text-ink">
            {isEdit ? `Edit ${existing!.label}` : 'Add a button'}
          </Dialog.Title>
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
        <Dialog.Description className="sr-only">
          {isEdit ? 'Edit this header button.' : 'Choose what kind of header button to add, then configure it.'}
        </Dialog.Description>

        <form
          className="flex flex-col gap-md"
          onSubmit={(event) => {
            event.preventDefault()
            void handleSubmit()
          }}
        >
          {!isEdit && (
              <div className="flex flex-col gap-sm">
                <span className={labelClass}>Kind of button</span>
                <div role="radiogroup" aria-label="Kind of button" className="flex flex-wrap gap-sm">
                  {HEADER_BUTTON_CATEGORIES.map((option) => (
                    <Chip
                      key={option}
                      as="button"
                      size="sm"
                      tone={category === option ? 'active' : 'surface'}
                      interactive
                      role="radio"
                      aria-checked={category === option}
                      onClick={() => setCategory(option)}
                    >
                      {headerButtonCategoryLabel(option)}
                    </Chip>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-xs">
              <label htmlFor="header-button-label" className={labelClass}>
                Name
              </label>
              <input
                id="header-button-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="e.g. Journaling"
                className={fieldClass}
              />
            </div>

            {category === 'activity' && (
              <>
                {!isEdit && (
                  <div className="flex flex-col gap-xs">
                    <label htmlFor="header-button-activity" className={labelClass}>
                      Activity to quick-log
                    </label>
                    <select
                      id="header-button-activity"
                      value={activityName}
                      onChange={(event) => setActivityName(event.target.value)}
                      className={fieldClass}
                    >
                      <option value="">Choose an activity…</option>
                      {ACTIVITY_CARDS.map((card) => (
                        <option key={card.name} value={card.name}>
                          {card.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {!isEdit && typeOptions.length > 0 && (
                  <label className="flex items-center gap-sm text-body text-ink">
                    <input
                      type="checkbox"
                      checked={quickLogType}
                      onChange={(event) => setQuickLogType(event.target.checked)}
                    />
                    Offer a type selector ({typeOptions.join(', ')})
                  </label>
                )}
                {((isEdit && existing!.quickLogType) || (!isEdit && quickLogType)) && (
                  <div className="flex flex-col gap-xs pl-lg">
                    <label htmlFor="header-button-type-label" className={labelClass}>
                      Type field label
                    </label>
                    <input
                      id="header-button-type-label"
                      value={quickLogTypeLabel}
                      onChange={(event) => setQuickLogTypeLabel(event.target.value)}
                      className={fieldClass}
                    />
                  </div>
                )}

                {/* Fields — every configured note field this button logs
                    alongside duration, text and multiselect alike (was three
                    separate checkboxes: primary note / secondary note / the
                    Sleep-only "quality picker" special case; now one
                    generic, uncapped-for-multiselect list). */}
                <div className="flex flex-col gap-sm">
                  <span className={labelClass}>Fields</span>

                  {fields.length > 0 && (
                    <div className="flex flex-col gap-xs">
                      {fields.map((field, index) => (
                        <div
                          key={field.id ?? `draft-${index}`}
                          className="flex items-center gap-sm rounded-md border border-line bg-surface px-md py-sm"
                        >
                          {field.fieldKind === 'multiselect' ? (
                            <ListChecks aria-hidden="true" className="size-[16px] shrink-0 text-ink-dim" />
                          ) : (
                            <AlignLeft aria-hidden="true" className="size-[16px] shrink-0 text-ink-dim" />
                          )}
                          <div className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-body font-medium text-ink">{field.label}</span>
                            <span className="text-caption text-ink-dim">
                              {field.fieldKind === 'multiselect' ? 'Multiple choice' : 'Text note'}
                            </span>
                          </div>
                          <button
                            type="button"
                            aria-label={`Remove ${field.label}`}
                            onClick={() => removeField(index)}
                            className="flex size-[24px] shrink-0 items-center justify-center rounded-full text-ink-dim transition-colors hover:bg-bg hover:text-ink"
                          >
                            <X aria-hidden="true" className="size-[12px]" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {!isAddingField ? (
                    <button
                      type="button"
                      onClick={openAddField}
                      className="flex items-center justify-center gap-xs rounded-md border border-dashed border-line px-md py-sm text-caption font-semibold text-ink-dim transition-colors hover:border-ink hover:text-ink"
                    >
                      <Plus aria-hidden="true" className="size-[14px]" />
                      Add field
                    </button>
                  ) : (
                    <div className="flex flex-col gap-sm rounded-md border border-line bg-bg p-md">
                      <div role="radiogroup" aria-label="Field type" className="flex gap-sm">
                        <Chip
                          as="button"
                          size="segment"
                          tone={draftKind === 'text' ? 'active' : 'surface'}
                          interactive={textFieldCount < MAX_TEXT_FIELDS}
                          aria-disabled={textFieldCount >= MAX_TEXT_FIELDS}
                          role="radio"
                          aria-checked={draftKind === 'text'}
                          onClick={() => textFieldCount < MAX_TEXT_FIELDS && setDraftKind('text')}
                          className={cn(
                            'flex-1 justify-center',
                            textFieldCount >= MAX_TEXT_FIELDS && 'pointer-events-none opacity-40',
                          )}
                        >
                          Text note
                        </Chip>
                        <Chip
                          as="button"
                          size="segment"
                          tone={draftKind === 'multiselect' ? 'active' : 'surface'}
                          interactive
                          role="radio"
                          aria-checked={draftKind === 'multiselect'}
                          onClick={() => setDraftKind('multiselect')}
                          className="flex-1 justify-center"
                        >
                          Multiple choice
                        </Chip>
                      </div>
                      {textFieldCount >= MAX_TEXT_FIELDS && draftKind !== 'text' && (
                        <p className="text-caption text-ink-dim">
                          Text notes are limited to {MAX_TEXT_FIELDS} per button.
                        </p>
                      )}

                      <div className="flex flex-col gap-xs">
                        <label htmlFor="field-title" className={labelClass}>
                          Title
                        </label>
                        <input
                          id="field-title"
                          value={draftLabel}
                          onChange={(event) => setDraftLabel(event.target.value)}
                          placeholder={draftKind === 'multiselect' ? 'e.g. How was your sleep?' : 'e.g. Note'}
                          className={fieldClass}
                        />
                      </div>

                      {draftKind === 'multiselect' && (
                        <div className="flex flex-col gap-xs">
                          <div className="flex items-center justify-between">
                            <span className={labelClass}>Options</span>
                            <span className="text-caption text-ink-dim">
                              {draftOptions.filter((o) => o.trim() !== '').length} option
                              {draftOptions.filter((o) => o.trim() !== '').length === 1 ? '' : 's'}
                            </span>
                          </div>
                          {draftOptions.map((option, index) => (
                            <div key={index} className="flex items-center gap-xs">
                              <input
                                aria-label={`Option ${index + 1}`}
                                value={option}
                                onChange={(event) => updateDraftOption(index, event.target.value)}
                                placeholder={`Option ${index + 1}`}
                                className={fieldClass}
                              />
                              <button
                                type="button"
                                aria-label={`Remove option ${index + 1}`}
                                onClick={() => removeDraftOption(index)}
                                className="flex size-[28px] shrink-0 items-center justify-center rounded-full text-ink-dim transition-colors hover:bg-bg hover:text-ink"
                              >
                                <X aria-hidden="true" className="size-[12px]" />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => setDraftOptions([...draftOptions, ''])}
                            className="self-start text-caption font-semibold text-ink-dim transition-colors hover:text-ink"
                          >
                            + Add option
                          </button>
                        </div>
                      )}

                      {fieldError && (
                        <p role="alert" className="text-caption font-semibold text-ink">
                          {fieldError}
                        </p>
                      )}

                      <div className="flex items-center justify-end gap-sm pt-xs">
                        <Button type="button" variant="outline" onClick={cancelAddField}>
                          Cancel
                        </Button>
                        <Button type="button" onClick={confirmAddField}>
                          Add field
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {category === 'day_value' && (
              <>
                <div className="flex flex-col gap-xs">
                  <span className={labelClass}>Value shape</span>
                  <div role="radiogroup" aria-label="Value shape" className="flex flex-wrap gap-sm">
                    {(['int', 'min', 'target'] as const).map((option) => (
                      <Chip
                        key={option}
                        as="button"
                        size="sm"
                        tone={dayValueUnit === option ? 'active' : 'surface'}
                        interactive
                        role="radio"
                        aria-checked={dayValueUnit === option}
                        onClick={() => setDayValueUnit(option)}
                      >
                        {option === 'int' ? 'Plain count' : option === 'min' ? 'Minutes' : 'Progress toward a target'}
                      </Chip>
                    ))}
                  </div>
                </div>
                {dayValueUnit === 'target' && (
                  <div className="flex flex-col gap-xs">
                    <label htmlFor="header-button-target" className={labelClass}>
                      Daily target
                    </label>
                    <input
                      id="header-button-target"
                      type="number"
                      min={0}
                      value={dayValueTarget}
                      onChange={(event) => setDayValueTarget(event.target.value)}
                      className={fieldClass}
                    />
                  </div>
                )}
              </>
            )}

            {category === 'notes' && (
              <div className="flex flex-col gap-xs">
                <label htmlFor="header-button-note-types" className={labelClass}>
                  Type options (optional, one per line)
                </label>
                <textarea
                  id="header-button-note-types"
                  value={noteTypesText}
                  onChange={(event) => setNoteTypesText(event.target.value)}
                  rows={3}
                  placeholder={'e.g.\nInsight\nQuestion\nGratitude'}
                  className={fieldClass}
                />
              </div>
            )}

            {category === 'checklist' && (
              <div className="flex flex-col gap-xs">
                <label htmlFor="header-button-checklist-items" className={labelClass}>
                  Items (one per line)
                </label>
                <textarea
                  id="header-button-checklist-items"
                  value={checklistItemsText}
                  onChange={(event) => setChecklistItemsText(event.target.value)}
                  rows={5}
                  placeholder={'e.g.\nStretch\nDrink water\nJournal'}
                  className={fieldClass}
                />
              </div>
            )}

            {error && (
              <p role="alert" className="rounded-md border border-ink bg-ink/10 px-md py-sm text-caption font-semibold text-ink">
                {error}
              </p>
            )}

            <div className="flex items-center justify-end gap-sm">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving…' : isEdit ? 'Save' : 'Add button'}
              </Button>
            </div>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  )
}
