import { AlignLeft, ArrowDown, ArrowUp, EyeOff, Hash, ListChecks, NotebookPen, Pencil, Plus, Timer, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { catalogIdForName } from '@/api/catalog'
import {
  addNoteField,
  defaultNewFieldKind,
  draftFromButton,
  MAX_TEXT_FIELDS,
  textFieldCount,
  toCreateInput,
  toUpdateInput,
  validateHeaderButtonDraft,
  type HeaderButtonDraft,
} from '@/domain/headerButtonForm'
import { HEADER_BUTTON_CATEGORIES, headerButtonCategoryLabel, type HeaderButtonCategory, type HeaderButtonConfig } from '@/domain/headerButtons'
import { supabaseConfigured } from '@/lib/supabaseClient'
import { Button } from '@/lumen/components/ui/button'
import { MenuItem, Segmented, Switch } from '@/lumen/components/ui/primitives'
import { Sheet } from '@/lumen/components/ui/sheet'
import { useStore } from '@/lumen/lib/store'
import { cn } from '@/lumen/lib/utils'
import { AddRow, EditRow, Field, Group, inputClass, Notice, SettingsPage, SmallIcon, textareaClass } from './parts'

const CATEGORY_ICON: Record<HeaderButtonCategory, typeof Timer> = {
  activity: Timer,
  day_value: Hash,
  notes: NotebookPen,
  checklist: ListChecks,
}

/**
 * The person's header buttons — the row of chips on Today (and Classic's
 * header). Add, edit, reorder, hide and bring back, over the same
 * `useHeaderButtons` list and the same form rules as Classic's editor
 * (`domain/headerButtonForm.ts`).
 */
export function ButtonsScreen({ onBack }: { onBack: () => void }) {
  const { headerButtons } = useStore()
  const [form, setForm] = useState<null | { button: HeaderButtonConfig | null }>(null)
  const visible = headerButtons.visible
  const hidden = headerButtons.hidden

  function move(id: string, dir: -1 | 1) {
    const order = visible.map((b) => b.id)
    const i = order.indexOf(id)
    const j = i + dir
    if (j < 0 || j >= order.length) return
    ;[order[i], order[j]] = [order[j], order[i]]
    headerButtons.reorder(order)
  }

  return (
    <SettingsPage eyebrow="Settings" title="Header buttons" onBack={onBack}>
      {!supabaseConfigured && <Notice>You’re not signed in to an account, so these changes stay on this device only.</Notice>}
      {headerButtons.error && <Notice>{headerButtons.error}</Notice>}

      <Group title="On Today">
        {visible.length === 0 && <p className="px-4 py-4 text-sm text-ink-faint">No buttons showing.</p>}
        {visible.map((button, i) => (
          <EditRow
            key={button.id}
            lead={<SmallIcon icon={CATEGORY_ICON[button.category]} />}
            label={button.label}
            hint={describe(button)}
            onOpen={() => setForm({ button })}
            menu={(close) => (
              <>
                <MenuItem icon={Pencil} onSelect={() => { close(); setForm({ button }) }}>Edit</MenuItem>
                <MenuItem icon={ArrowUp} disabled={i === 0} onSelect={() => { close(); move(button.id, -1) }}>Move up</MenuItem>
                <MenuItem icon={ArrowDown} disabled={i === visible.length - 1} onSelect={() => { close(); move(button.id, 1) }}>Move down</MenuItem>
                <MenuItem icon={EyeOff} onSelect={() => { close(); headerButtons.hideButton(button.id) }}>Hide</MenuItem>
              </>
            )}
          />
        ))}
        <AddRow label="Add a button" onClick={() => setForm({ button: null })} />
      </Group>

      {hidden.length > 0 && (
        <Group title="Hidden">
          {hidden.map((button) => (
            <div key={button.id} className="flex min-h-14 items-center gap-3 px-4">
              <SmallIcon icon={CATEGORY_ICON[button.category]} />
              <span className="flex-1 truncate text-[15px] text-ink-muted">{button.label}</span>
              <Button variant="ghost" className="h-9 px-3 text-accent-ink" onClick={() => headerButtons.unhideButton(button.id)}>
                <Plus className="h-4 w-4" />
                Show
              </Button>
            </div>
          ))}
        </Group>
      )}

      <ButtonFormSheet form={form} onClose={() => setForm(null)} />
    </SettingsPage>
  )
}

function describe(button: HeaderButtonConfig): string {
  switch (button.category) {
    case 'activity':
      return `Quick log · ${button.activityName ?? 'activity'}`
    case 'day_value':
      return button.dayValueUnit === 'target' ? `Daily target · ${button.dayValueTarget ?? ''}` : button.dayValueUnit === 'min' ? 'Minutes per day' : 'Count per day'
    case 'checklist':
      return `Checklist · ${button.checklistItems.length} items`
    case 'notes':
      return button.noteTypes.length ? `Notes · ${button.noteTypes.join(', ')}` : 'Notes'
  }
}

/* ——— Add / edit ——— */

function ButtonFormSheet({ form, onClose }: { form: null | { button: HeaderButtonConfig | null }; onClose: () => void }) {
  const { headerButtons, allTiles } = useStore()
  const existing = form?.button ?? null
  const isEdit = existing !== null
  const [draft, setDraft] = useState<HeaderButtonDraft>(() => draftFromButton(null))
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [fieldForm, setFieldForm] = useState<null | { kind: 'text' | 'multiselect'; label: string; options: string[]; error: string | null }>(null)
  const [lastForm, setLastForm] = useState<typeof form>(null)

  // A fresh draft each time the sheet opens.
  if (form !== lastForm) {
    setLastForm(form)
    if (form) {
      setDraft(draftFromButton(form.button))
      setError(null)
      setSubmitting(false)
      setFieldForm(null)
    }
  }

  const set = (patch: Partial<HeaderButtonDraft>) => setDraft((d) => ({ ...d, ...patch }))

  async function submit() {
    const problem = validateHeaderButtonDraft(draft, isEdit)
    if (problem) {
      setError(problem)
      return
    }
    if (submitting) return // rule 9
    setSubmitting(true)
    setError(null)
    if (existing) {
      headerButtons.updateButton(toUpdateInput(draft, existing))
    } else {
      const activityId = draft.category === 'activity' ? await catalogIdForName(draft.activityName) : null
      headerButtons.addButton(toCreateInput(draft, activityId))
    }
    onClose()
  }

  function confirmField() {
    if (!fieldForm) return
    const result = addNoteField(draft.fields, { kind: fieldForm.kind, label: fieldForm.label, options: fieldForm.options })
    if (!result.ok) {
      setFieldForm({ ...fieldForm, error: result.error })
      return
    }
    set({ fields: result.fields })
    setFieldForm(null)
  }

  const category = draft.category
  const atTextMax = textFieldCount(draft.fields) >= MAX_TEXT_FIELDS

  return (
    <Sheet
      open={form !== null}
      onOpenChange={(o) => !o && onClose()}
      title={existing ? `Edit ${existing.label}` : 'Add a button'}
      footer={
        <div className="flex flex-col gap-2">
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <Button variant="primary" size="lg" className="w-full" disabled={submitting} onClick={() => void submit()}>
            {existing ? 'Save' : 'Add button'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {!isEdit && (
          <div>
            <p className="mb-2 text-xs font-medium text-ink-muted">Kind of button</p>
            <div role="radiogroup" aria-label="Kind of button" className="grid grid-cols-2 gap-2">
              {HEADER_BUTTON_CATEGORIES.map((c) => {
                const Icon = CATEGORY_ICON[c]
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={category === c}
                    onClick={() => set({ category: c })}
                    className={cn(
                      'flex min-h-12 items-center gap-2.5 rounded-control border px-3 text-left text-sm transition-colors',
                      category === c ? 'border-accent-ink/50 bg-accent/[0.12] text-ink' : 'border-line/[0.09] text-ink-muted hover:text-ink',
                    )}
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.8} />
                    {headerButtonCategoryLabel(c)}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <Field label="Name">
          <input className={inputClass} placeholder="e.g. Journaling" value={draft.label} onChange={(e) => set({ label: e.target.value })} />
        </Field>

        {category === 'activity' && (
          <>
            {!isEdit && (
              <Field label="Activity to quick-log">
                <select className={cn(inputClass, '[color-scheme:dark]')} value={draft.activityName} onChange={(e) => set({ activityName: e.target.value })}>
                  <option value="">Choose an activity…</option>
                  {allTiles.map((t) => (
                    <optgroup key={t.id} label={t.label}>
                      {t.cards.map((c) => (
                        <option key={`${t.id}:${c.name}`} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </Field>
            )}
            {!isEdit && (
              <div className="flex min-h-11 items-center justify-between gap-3">
                <span className="text-sm text-ink">Offer a type choice when logging</span>
                <Switch checked={draft.quickLogType} onChange={() => set({ quickLogType: !draft.quickLogType })} label="Offer a type choice" />
              </div>
            )}
            {((isEdit && existing?.quickLogType) || (!isEdit && draft.quickLogType)) && (
              <Field label="Type field label">
                <input className={inputClass} value={draft.quickLogTypeLabel} onChange={(e) => set({ quickLogTypeLabel: e.target.value })} />
              </Field>
            )}

            <div>
              <p className="mb-2 text-xs font-medium text-ink-muted">Note fields</p>
              <ul className="flex flex-col gap-1.5">
                {draft.fields.length === 0 && <li className="text-sm text-ink-faint">None.</li>}
                {draft.fields.map((f, i) => (
                  <li key={f.id ?? `${f.label}-${i}`} className="flex min-h-12 items-center gap-3 rounded-control border border-line/[0.07] bg-white/[0.02] pl-3 pr-1">
                    {f.fieldKind === 'text' ? <AlignLeft className="h-4 w-4 text-ink-muted" /> : <ListChecks className="h-4 w-4 text-ink-muted" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{f.label}</span>
                      <span className="block truncate text-xs text-ink-faint">{f.fieldKind === 'text' ? 'Text' : f.options.join(', ')}</span>
                    </span>
                    <Button variant="ghost" size="icon" aria-label={`Remove ${f.label}`} onClick={() => set({ fields: draft.fields.filter((_, j) => j !== i) })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>

              {fieldForm ? (
                <div className="mt-2 flex flex-col gap-3 rounded-tile border border-line/[0.09] bg-surface-2/40 p-3">
                  <Segmented<'text' | 'multiselect'>
                    label="Field kind"
                    layoutId="field-kind"
                    value={fieldForm.kind}
                    onChange={(kind) => setFieldForm({ ...fieldForm, kind })}
                    options={[
                      { value: 'text', label: 'Text', disabled: atTextMax },
                      { value: 'multiselect', label: 'Choices' },
                    ]}
                  />
                  <input
                    className={inputClass}
                    placeholder="Field title"
                    aria-label="Field title"
                    value={fieldForm.label}
                    onChange={(e) => setFieldForm({ ...fieldForm, label: e.target.value })}
                  />
                  {fieldForm.kind === 'multiselect' && (
                    <div className="flex flex-col gap-2">
                      {fieldForm.options.map((o, i) => (
                        <div key={i} className="flex gap-2">
                          <input
                            className={cn(inputClass, 'h-10')}
                            placeholder={`Choice ${i + 1}`}
                            aria-label={`Choice ${i + 1}`}
                            value={o}
                            onChange={(e) => setFieldForm({ ...fieldForm, options: fieldForm.options.map((x, j) => (j === i ? e.target.value : x)) })}
                          />
                          {fieldForm.options.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-10 w-10"
                              aria-label={`Remove choice ${i + 1}`}
                              onClick={() => setFieldForm({ ...fieldForm, options: fieldForm.options.filter((_, j) => j !== i) })}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button variant="ghost" className="h-9 self-start px-2 text-accent-ink" onClick={() => setFieldForm({ ...fieldForm, options: [...fieldForm.options, ''] })}>
                        <Plus className="h-4 w-4" />
                        Add a choice
                      </Button>
                    </div>
                  )}
                  {fieldForm.error && <p className="text-sm text-danger">{fieldForm.error}</p>}
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" className="h-10" onClick={() => setFieldForm(null)}>
                      Cancel
                    </Button>
                    <Button variant="primary" className="h-10" onClick={confirmField}>
                      Add field
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  className="mt-1 h-10 px-2 text-accent-ink"
                  onClick={() => setFieldForm({ kind: defaultNewFieldKind(draft.fields), label: '', options: [''], error: null })}
                >
                  <Plus className="h-4 w-4" />
                  Add a note field
                </Button>
              )}
            </div>
          </>
        )}

        {category === 'day_value' && (
          <>
            {!isEdit && (
              <div>
                <p className="mb-2 text-xs font-medium text-ink-muted">Counts as</p>
                <Segmented<'int' | 'min' | 'target'>
                  label="Counts as"
                  layoutId="day-value-unit"
                  value={draft.dayValueUnit}
                  onChange={(dayValueUnit) => set({ dayValueUnit })}
                  options={[
                    { value: 'int', label: 'Number' },
                    { value: 'min', label: 'Minutes' },
                    { value: 'target', label: 'Target' },
                  ]}
                />
              </div>
            )}
            {draft.dayValueUnit === 'target' && (
              <Field label="Daily target">
                <input
                  className={inputClass}
                  inputMode="numeric"
                  value={draft.dayValueTarget}
                  onChange={(e) => set({ dayValueTarget: e.target.value.replace(/[^\d]/g, '') })}
                />
              </Field>
            )}
          </>
        )}

        {category === 'notes' && (
          <Field label="Types to choose from" hint="One per line. Leave empty for plain notes.">
            <textarea className={textareaClass} rows={4} value={draft.noteTypesText} onChange={(e) => set({ noteTypesText: e.target.value })} />
          </Field>
        )}

        {category === 'checklist' && (
          <Field label="Items" hint="One per line. Resets every day.">
            <textarea className={textareaClass} rows={6} value={draft.checklistItemsText} onChange={(e) => set({ checklistItemsText: e.target.value })} />
          </Field>
        )}
      </div>
    </Sheet>
  )
}
