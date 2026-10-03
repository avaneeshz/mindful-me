import { describe, expect, it } from 'vitest'
import { resolveNoteFields, validateNoteLabel } from './activityNoteFields'

const sleepFields = [
  { fieldKind: 'text', key: 'primary', label: 'Note' },
  { fieldKind: 'text', key: 'secondary', label: 'Dreams' },
  { fieldKind: 'multiselect', key: null, label: 'How was your sleep?' },
]

describe('resolveNoteFields', () => {
  it('gives an unconfigured activity one untitled note and no second note', () => {
    expect(resolveNoteFields(null)).toEqual({ primaryLabel: null, secondaryLabel: null })
  })

  it('uses the activity’s own titles first', () => {
    expect(resolveNoteFields({ noteLabel: 'Reflection', secondNoteLabel: 'Gratitude' }, sleepFields)).toEqual({
      primaryLabel: 'Reflection',
      secondaryLabel: 'Gratitude',
    })
  })

  it('borrows the header button’s text fields only for a row that has no note titles at all', () => {
    expect(resolveNoteFields({}, sleepFields)).toEqual({ primaryLabel: 'Note', secondaryLabel: 'Dreams' })
    expect(resolveNoteFields(null, sleepFields)).toEqual({ primaryLabel: 'Note', secondaryLabel: 'Dreams' })
  })

  it('treats a saved row as authoritative: no second note stays none, whatever the button holds', () => {
    expect(resolveNoteFields({ noteLabel: null, secondNoteLabel: null }, sleepFields)).toEqual({
      primaryLabel: null,
      secondaryLabel: null,
    })
  })

  it('lets an activity add a second note on its own', () => {
    expect(resolveNoteFields({ secondNoteLabel: 'Lessons' })).toEqual({
      primaryLabel: null,
      secondaryLabel: 'Lessons',
    })
  })
})

describe('validateNoteLabel', () => {
  it('rejects blank and over-long titles', () => {
    expect(validateNoteLabel('   ')).not.toBeNull()
    expect(validateNoteLabel('x'.repeat(61))).not.toBeNull()
    expect(validateNoteLabel('Gratitude')).toBeNull()
  })
})
