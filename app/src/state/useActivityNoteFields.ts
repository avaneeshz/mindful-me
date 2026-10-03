import { useMemo } from 'react'
import { displayButtonForActivityName } from '@/domain/displayButtons'
import { resolveNoteFields, type NoteFields } from '@/domain/activityNoteFields'
import { rowForLoggedActivity } from '@/domain/colors'
import { useOptionalPickerData } from './PickerDataContext'

/**
 * The note fields to show when logging `cardName`: the activity's own titles
 * (set while editing it), else its header button's, else one default note.
 * Reads the shared picker data, so a title saved in the activity editor shows
 * in the log form on the very next render. Outside a `PickerDataProvider`
 * (isolated tests) it falls back to the header button alone.
 */
export function useActivityNoteFields(cardName: string | null): NoteFields {
  const rows = useOptionalPickerData()?.activities.activities
  return useMemo(() => {
    const own = rows && cardName ? rowForLoggedActivity(rows, cardName, []) : null
    const buttonFields = cardName ? displayButtonForActivityName(cardName)?.noteFields : undefined
    return resolveNoteFields(own, buttonFields)
  }, [rows, cardName])
}
