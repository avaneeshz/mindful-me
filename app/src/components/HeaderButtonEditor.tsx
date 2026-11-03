import { useEffect, useId, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { AlignLeft, Check, ChevronDown, ChevronUp, Clock, Hash, ListChecks, Pencil, Plus, Trash2, X, type LucideIcon } from 'lucide-react'
import { Chip, chipVariants } from '@/components/ui/chip'
import { Button } from '@/components/ui/button'
import {
  HEADER_BUTTON_CATEGORIES,
  MAX_GROUP_NAME_LENGTH,
  headerButtonCategoryLabel,
  validateGroupName,
  type HeaderButtonCategory,
  type HeaderButtonConfig,
  type HeaderButtonGroup,
} from '@/domain/headerButtons'
import type { UpdateHeaderButtonInput } from '@/api/headerButtons'
import {
  addNoteField,
  type NewHeaderButtonInput,
  ACTIVITY_NOTES_HINT,
  toCreateInput,
  toUpdateInput,
  validateHeaderButtonDraft,
  type FieldDraft,
  type HeaderButtonDraft,
} from '@/domain/headerButtonForm'
import { allActivityCards, findCard, firstLevelOptionNames } from '@/data/activities'
import { catalogIdForName } from '@/api/catalog'
import { fieldClass, labelClass } from '@/components/ui/formField'
import { cn } from '@/lib/utils'

/**
 * The header/home-screen "edit mode" toggle and everything it turns on —
 * per-button remove/edit affordances, the "add a button" chip, the add/edit
 * form itself. Hidden buttons are restored from Settings → Hidden items. Deliberately NOT a separate
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
      aria-label={active ? 'Done editing' : 'Edit'}
      onClick={onToggle}
      className={cn(
        chipVariants({ tone: active ? 'active' : 'surface', size: 'sm', interactive: true }),
        'font-semibold',
      )}
    >
      {active ? <Check aria-hidden="true" className="size-[14px]" /> : <Pencil aria-hidden="true" className="size-[14px]" />}
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

/** A dashed "add" chip — one per category row ("Add button"), and one under the last row ("Add category"). */
export function AddHeaderButtonChip({ label = 'Add button', onClick }: { label?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        chipVariants({ tone: 'surface', size: 'sm', interactive: true }),
        'border-dashed font-semibold text-ink-dim hover:text-ink',
      )}
    >
      <Plus aria-hidden="true" className="size-[14px]" />
      <span>{label}</span>
    </button>
  )
}

const iconButtonClass =
  'flex size-[24px] shrink-0 items-center justify-center rounded-full text-ink-dim transition-colors hover:bg-bg hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:pointer-events-none disabled:opacity-40'

/** A one-line name field with Save / Cancel — adding a category and renaming one share it. */
function CategoryNameForm({
  initial,
  groups,
  exceptId,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: string
  groups: readonly HeaderButtonGroup[]
  exceptId?: string
  submitLabel: string
  onSubmit: (name: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const errorId = useId()

  function submit() {
    const problem = validateGroupName(name, groups, exceptId)
    if (problem) {
      setError(problem)
      return
    }
    onSubmit(name.trim())
  }

  return (
    <form
      className="flex flex-wrap items-center gap-xs"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <input
        autoFocus
        aria-label="Category name"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        value={name}
        maxLength={MAX_GROUP_NAME_LENGTH}
        placeholder="e.g. Morning"
        onChange={(event) => {
          setName(event.target.value)
          setError(null)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel()
        }}
        className={cn(fieldClass, 'w-[200px]')}
      />
      <Button type="submit">
        {submitLabel}
      </Button>
      <Button type="button" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      {error && (
        <p id={errorId} role="alert" className="basis-full text-caption font-semibold text-ink">
          {error}
        </p>
      )}
    </form>
  )
}

/**
 * A category's name above its row. Always visible; in Edit mode it also carries
 * rename, move up / down and delete — all plain taps, so none of it depends on
 * dragging or hovering.
 */
export function CategoryHeading({
  group,
  groups,
  buttonCount,
  index,
  count,
  editMode,
  headingId,
  onRename,
  onMove,
  onDelete,
}: {
  group: HeaderButtonGroup
  groups: readonly HeaderButtonGroup[]
  buttonCount: number
  index: number
  count: number
  editMode: boolean
  headingId: string
  onRename: (name: string) => void
  onMove: (direction: -1 | 1) => void
  onDelete: () => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const target = groups.find((g) => g.id !== group.id)

  if (renaming) {
    return (
      <CategoryNameForm
        initial={group.name}
        groups={groups}
        exceptId={group.id}
        submitLabel="Save"
        onSubmit={(name) => {
          onRename(name)
          setRenaming(false)
        }}
        onCancel={() => setRenaming(false)}
      />
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-xs">
      <h2 id={headingId} className="text-nano font-bold uppercase tracking-tag text-ink-dim">
        {group.name}
      </h2>
      {editMode && !confirming && (
        <span className="flex items-center gap-[2px]">
          <button type="button" aria-label={`Rename ${group.name}`} onClick={() => setRenaming(true)} className={iconButtonClass}>
            <Pencil aria-hidden="true" className="size-[12px]" />
          </button>
          <button
            type="button"
            aria-label={`Move ${group.name} up`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
            className={iconButtonClass}
          >
            <ChevronUp aria-hidden="true" className="size-[14px]" />
          </button>
          <button
            type="button"
            aria-label={`Move ${group.name} down`}
            disabled={index === count - 1}
            onClick={() => onMove(1)}
            className={iconButtonClass}
          >
            <ChevronDown aria-hidden="true" className="size-[14px]" />
          </button>
          {count > 1 && (
            <button
              type="button"
              aria-label={`Delete ${group.name}`}
              onClick={() => (buttonCount === 0 ? onDelete() : setConfirming(true))}
              className={iconButtonClass}
            >
              <Trash2 aria-hidden="true" className="size-[12px]" />
            </button>
          )}
        </span>
      )}
      {editMode && confirming && target && (
        <span role="alert" className="flex flex-wrap items-center gap-xs text-caption text-ink-dim">
          Delete this category? Its {buttonCount} {buttonCount === 1 ? 'button moves' : 'buttons move'} to “{target.name}”.
          <Button
            type="button"
            onClick={() => {
              setConfirming(false)
              onDelete()
            }}
          >
            Delete
          </Button>
          <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
            Keep
          </Button>
        </span>
      )}
    </div>
  )
}

/** "Add category" — opens an inline name field in place. */
export function AddCategoryControl({
  groups,
  onAdd,
}: {
  groups: readonly HeaderButtonGroup[]
  onAdd: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  if (!open) return <AddHeaderButtonChip label="Add category" onClick={() => setOpen(true)} />
  return (
    <CategoryNameForm
      initial=""
      groups={groups}
      submitLabel="Add"
      onSubmit={(name) => {
        onAdd(name)
        setOpen(false)
      }}
      onCancel={() => setOpen(false)}
    />
  )
}

/** Step one of adding a button: what each type is, in a line. */
const TYPE_CHOICES: Record<HeaderButtonCategory, { icon: LucideIcon; description: string }> = {
  activity: { icon: Clock, description: 'Log time on an activity with one tap.' },
  notes: { icon: AlignLeft, description: 'Jot down a short written entry.' },
  day_value: { icon: Hash, description: 'Track one number for the day, like steps.' },
  checklist: { icon: ListChecks, description: 'Tick off a list of items each day.' },
}

type FormMode = { kind: 'add'; groupId: string; category?: HeaderButtonCategory } | { kind: 'edit'; button: HeaderButtonConfig }

export function HeaderButtonFormDialog({
  mode,
  groups,
  onClose,
  onCreate,
  onUpdate,
}: {
  mode: FormMode
  /** The user's categories — the form's Category picker, which is also how a button is moved by tapping. */
  groups: readonly HeaderButtonGroup[]
  onClose: () => void
  onCreate: (input: NewHeaderButtonInput, groupId: string) => void
  onUpdate: (input: UpdateHeaderButtonInput & { category: HeaderButtonCategory }, groupId: string) => void
}) {
  const isEdit = mode.kind === 'edit'
  const existing = mode.kind === 'edit' ? mode.button : null

  // Adding is two steps: first pick the type of button, then fill in its form.
  // Editing, or an add opened with a type already chosen, goes straight to the form.
  const [step, setStep] = useState<'type' | 'form'>(isEdit || mode.category ? 'form' : 'type')
  // The type is chosen when adding and fixed once the button exists.
  const [category, setCategory] = useState<HeaderButtonCategory>(mode.kind === 'edit' ? mode.button.category : (mode.category ?? 'activity'))
  const [groupId, setGroupId] = useState(
    mode.kind === 'add' ? mode.groupId : (existing?.groupId ?? groups[0]?.id ?? ''),
  )
  const [label, setLabel] = useState(existing?.label ?? '')
  // The Name follows the chosen activity until the user types their own.
  const [labelEdited, setLabelEdited] = useState(isEdit)
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
  }, [step])

  const typeOptions = category === 'activity' && activityName ? firstLevelOptionNames(findCard(activityName)) : []

  // The form's rules live in `domain/headerButtonForm.ts`, shared with Lumen's editor.
  const draft: HeaderButtonDraft = {
    category,
    label,
    activityName,
    quickLogType,
    quickLogTypeLabel,
    fields,
    dayValueUnit,
    dayValueTarget,
    noteTypesText,
    checklistItemsText,
  }

  function openAddField(): void {
    setDraftKind('multiselect')
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
    const result = addNoteField(fields, { kind: draftKind, label: draftLabel, options: draftOptions })
    if (!result.ok) {
      setFieldError(result.error)
      return
    }
    setFields(result.fields)
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

  async function handleSubmit(): Promise<void> {
    const validationError = validateHeaderButtonDraft(draft, isEdit)
    if (validationError) {
      setError(validationError)
      return
    }
    if (submitting) return
    setSubmitting(true)
    setError(null)

    if (isEdit) {
      onUpdate(toUpdateInput(draft, existing!), groupId)
      onClose()
      return
    }

    const activityId = category === 'activity' ? await catalogIdForName(activityName) : null
    onCreate(toCreateInput(draft, activityId), groupId)
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
            {isEdit ? `Edit ${existing!.label}` : 'Add button'}
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
          {isEdit
            ? 'Edit this Non-Negotiable Button.'
            : step === 'type'
              ? 'Choose what kind of button to add.'
              : `${headerButtonCategoryLabel(category)} — configure the new Non-Negotiable Button.`}
        </Dialog.Description>

        {step === 'type' && (
          <div role="group" aria-label="Button type" className="flex flex-col gap-sm">
            <p className="text-body text-ink-dim">What kind of button do you want to add?</p>
            {HEADER_BUTTON_CATEGORIES.map((option) => {
              const Icon = TYPE_CHOICES[option].icon
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setCategory(option)
                    setStep('form')
                  }}
                  className="flex items-center gap-md rounded-md border border-line bg-surface px-md py-md text-left transition-colors hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:bg-bg"
                >
                  <Icon aria-hidden="true" className="size-[18px] shrink-0 text-ink-dim" />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-body font-semibold text-ink">{headerButtonCategoryLabel(option)}</span>
                    <span className="text-caption text-ink-dim">{TYPE_CHOICES[option].description}</span>
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {step === 'form' && (
        <form
          className="flex flex-col gap-md"
          onSubmit={(event) => {
            event.preventDefault()
            void handleSubmit()
          }}
        >
            {!isEdit && (
              <p className="text-caption font-semibold text-ink-dim">{headerButtonCategoryLabel(category)}</p>
            )}

            {groups.length > 1 && (
              <div className="flex flex-col gap-xs">
                <label htmlFor="header-button-group" className={labelClass}>
                  Category
                </label>
                <select
                  id="header-button-group"
                  value={groupId}
                  onChange={(event) => setGroupId(event.target.value)}
                  className={fieldClass}
                >
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex flex-col gap-xs">
              <label htmlFor="header-button-label" className={labelClass}>
                Name
              </label>
              <input
                id="header-button-label"
                value={label}
                onChange={(event) => {
                  setLabel(event.target.value)
                  setLabelEdited(true)
                }}
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
                      onChange={(event) => {
                        setActivityName(event.target.value)
                        if (!labelEdited) setLabel(event.target.value)
                      }}
                      className={fieldClass}
                    >
                      <option value="">Choose an activity…</option>
                      {allActivityCards().map((card) => (
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
                  <p className="text-caption text-ink-dim">{ACTIVITY_NOTES_HINT}</p>

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
                              {field.fieldKind === 'multiselect' ? 'Multiple choice' : 'Text note · from the activity'}
                            </span>
                          </div>
                          {field.fieldKind === 'multiselect' && (
                            <button
                              type="button"
                              aria-label={`Remove ${field.label}`}
                              onClick={() => removeField(index)}
                              className="flex size-[24px] shrink-0 items-center justify-center rounded-full text-ink-dim transition-colors hover:bg-bg hover:text-ink"
                            >
                              <X aria-hidden="true" className="size-[12px]" />
                            </button>
                          )}
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
                      Add multiple-choice field
                    </button>
                  ) : (
                    <div className="flex flex-col gap-sm rounded-md border border-line bg-bg p-md">
                      <span className="text-body font-semibold text-ink">New multiple-choice field</span>
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
              {isEdit ? (
                <Button type="button" variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
              ) : (
                <Button type="button" variant="ghost" onClick={() => setStep('type')}>
                  Back
                </Button>
              )}
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving…' : isEdit ? 'Save' : 'Add'}
              </Button>
            </div>
        </form>
        )}
      </Dialog.Content>
    </Dialog.Root>
  )
}
