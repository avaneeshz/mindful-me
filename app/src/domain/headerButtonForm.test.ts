import { describe, expect, it } from 'vitest'
import { DEFAULT_HEADER_BUTTONS } from './headerButtons'
import {
  addNoteField,
  defaultNewFieldKind,
  draftFromButton,
  toCreateInput,
  toUpdateInput,
  validateHeaderButtonDraft,
  type FieldDraft,
} from './headerButtonForm'

describe('note fields', () => {
  it('fills the primary text slot, then secondary, then only multiselect', () => {
    let fields: FieldDraft[] = []
    const first = addNoteField(fields, { kind: 'text', label: ' Note ', options: [] })
    expect(first).toMatchObject({ ok: true })
    fields = (first as { fields: FieldDraft[] }).fields
    expect(fields[0]).toMatchObject({ key: 'primary', label: 'Note' })
    fields = (addNoteField(fields, { kind: 'text', label: 'Dreams', options: [] }) as { fields: FieldDraft[] }).fields
    expect(fields[1]).toMatchObject({ key: 'secondary' })
    expect(defaultNewFieldKind(fields)).toBe('multiselect')
    expect(addNoteField(fields, { kind: 'text', label: 'Third', options: [] })).toEqual({
      ok: false,
      error: 'Text notes are limited to 2 per button.',
    })
  })

  it('needs a title, and options for a multiselect', () => {
    expect(addNoteField([], { kind: 'text', label: '  ', options: [] })).toMatchObject({ ok: false, error: 'Give this field a title.' })
    expect(addNoteField([], { kind: 'multiselect', label: 'Mood', options: ['', ' '] })).toMatchObject({
      ok: false,
      error: 'Add at least one option.',
    })
    expect(addNoteField([], { kind: 'multiselect', label: 'Mood', options: [' Calm ', ''] })).toMatchObject({
      ok: true,
      fields: [{ fieldKind: 'multiselect', key: null, options: ['Calm'] }],
    })
  })
})

describe('validation', () => {
  it('asks for what each kind of button needs', () => {
    const blank = draftFromButton(null)
    expect(validateHeaderButtonDraft(blank, false)).toBe('Give this button a name.')
    expect(validateHeaderButtonDraft({ ...blank, label: 'Run' }, false)).toBe('Choose an activity to quick-log.')
    expect(validateHeaderButtonDraft({ ...blank, label: 'Water', category: 'day_value', dayValueUnit: 'target' }, false)).toBe(
      'Set a daily target.',
    )
    expect(validateHeaderButtonDraft({ ...blank, label: 'Vitamins', category: 'checklist' }, false)).toBe(
      'Add at least one checklist item.',
    )
    expect(validateHeaderButtonDraft({ ...blank, label: 'Ideas', category: 'notes' }, false)).toBeNull()
  })

  it('refuses a note type listed twice, ignoring case and spaces', () => {
    const notes = { ...draftFromButton(null), label: 'Relational Nutrients', category: 'notes' as const }
    expect(validateHeaderButtonDraft({ ...notes, noteTypesText: 'Calm\nHope\n calm ' }, true)).toBe(
      '“calm” is listed more than once. Each type can only appear once.',
    )
    expect(validateHeaderButtonDraft({ ...notes, noteTypesText: 'Calm\nHope\n\nJoy' }, true)).toBeNull()
  })

  it('refuses a checklist item listed twice', () => {
    const checklist = { ...draftFromButton(null), label: 'Vitamins', category: 'checklist' as const }
    expect(validateHeaderButtonDraft({ ...checklist, checklistItemsText: 'D3\nZinc\nD3' }, false)).toBe(
      '“D3” is listed more than once. Each item can only appear once.',
    )
  })

  it('refuses a repeated option in a multiselect field', () => {
    const activity = {
      ...draftFromButton(null),
      label: 'Run',
      activityName: 'Running',
      fields: [{ fieldKind: 'multiselect' as const, key: null, label: 'Terrain', options: ['Road', 'road'] }],
    }
    expect(validateHeaderButtonDraft(activity, false)).toBe(
      '“road” is listed more than once. Each option can only appear once. (in “Terrain”)',
    )
    expect(addNoteField([], { kind: 'multiselect', label: 'Terrain', options: ['Trail', ' trail '] })).toEqual({
      ok: false,
      error: '“trail” is listed more than once. Each option can only appear once.',
    })
  })
})

describe('saving', () => {
  it('builds a new checklist and a new target day value', () => {
    const draft = { ...draftFromButton(null), category: 'checklist' as const, label: ' Vitamins ', checklistItemsText: 'D3\n\n Omega 3 ' }
    expect(toCreateInput(draft, null)).toMatchObject({
      category: 'checklist',
      label: 'Vitamins',
      checklistItems: [{ label: 'D3' }, { label: 'Omega 3' }],
      noteFields: [],
    })
    const water = { ...draftFromButton(null), category: 'day_value' as const, label: 'Water', dayValueUnit: 'target' as const, dayValueTarget: '8' }
    expect(toCreateInput(water, null)).toMatchObject({ dayValueUnit: 'target', dayValueTarget: 8 })
  })

  it('keeps existing checklist item keys by position when editing', () => {
    const supplements = DEFAULT_HEADER_BUTTONS.find((b) => b.category === 'checklist')!
    const draft = draftFromButton(supplements)
    const edited = { ...draft, checklistItemsText: ['Renamed', ...draft.checklistItemsText.split('\n').slice(1)].join('\n') }
    const input = toUpdateInput(edited, supplements)
    expect(input.checklistItems?.[0]).toEqual({ key: supplements.checklistItems[0].key, label: 'Renamed' })
    expect(input.noteFields).toBeNull()
  })
})
