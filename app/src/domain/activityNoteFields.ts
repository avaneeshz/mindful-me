/**
 * Which note fields an activity shows when it is logged, and what they are
 * called. Every activity has one free-text note and room for a second (the
 * two physical columns on a logged activity — `notes` and `dreamsNote`). An
 * activity's OWN titles, set while editing it, win; otherwise whatever its
 * activity-category header button configures (Sleep's "Dreams"); otherwise
 * one untitled note. Pure — no React, no storage.
 */
export const MAX_NOTE_LABEL_LENGTH = 60

export interface NoteFields {
  /** Title of the first note (always shown), or `null` for the screen's own default wording. */
  primaryLabel: string | null
  /** Title of the second note, or `null` when the activity has none. */
  secondaryLabel: string | null
}

interface OwnLabels {
  noteLabel?: string | null
  secondNoteLabel?: string | null
}

interface ButtonField {
  fieldKind: string
  key: string | null
  label: string
}

export function resolveNoteFields(
  own: OwnLabels | null | undefined,
  buttonFields: readonly ButtonField[] = [],
): NoteFields {
  // An activity row that carries note titles at all (even both null) is the
  // single source of truth: its header button is only ever a view of it, so
  // "no second note" must stay "no second note" and never fall back to
  // whatever the button used to hold. Only a row that has never been told
  // about note titles (local-only preview data, `undefined`) borrows them
  // from the button's own configured text fields.
  const authoritative = own != null && (own.noteLabel !== undefined || own.secondNoteLabel !== undefined)
  const fromButton = (key: 'primary' | 'secondary') =>
    authoritative ? null : (buttonFields.find((f) => f.fieldKind === 'text' && f.key === key)?.label ?? null)
  return {
    primaryLabel: own?.noteLabel?.trim() || fromButton('primary'),
    secondaryLabel: own?.secondNoteLabel?.trim() || fromButton('secondary'),
  }
}

/** The first problem with a note title, in plain language, or null when it is fine to save. */
export function validateNoteLabel(label: string): string | null {
  const trimmed = label.trim()
  if (trimmed === '') return 'Give this note a title.'
  if (trimmed.length > MAX_NOTE_LABEL_LENGTH) return `Keep the title under ${MAX_NOTE_LABEL_LENGTH} characters.`
  return null
}
