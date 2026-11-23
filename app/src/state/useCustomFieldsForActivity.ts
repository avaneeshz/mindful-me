import { useMemo } from 'react'
import { loggableFields, type ActivityField } from '@/domain/activityFields'
import { rowForLoggedActivity } from '@/domain/colors'
import { useOptionalPickerData } from './PickerDataContext'

/**
 * The notes and multiple-select fields to show when logging `cardName` (+ `path`), or `undefined`
 * when they aren't available — outside a `PickerDataProvider`, before they have loaded, or when the
 * server could not be reached — so the log form shows its original fixed fields instead.
 */
export function useCustomFieldsForActivity(cardName: string | null, path: readonly string[]): ActivityField[] | undefined {
  const picker = useOptionalPickerData()
  const rows = picker?.activities.activities
  const fields = picker?.activityFields.fields
  const ready = picker?.activityFields.status === 'ready'
  const pathKey = path.join('\u0000')
  return useMemo(() => {
    if (!rows || !fields || !ready || !cardName) return undefined
    const row = rowForLoggedActivity(rows, cardName, path)
    return row ? loggableFields(fields, rows, row.id) : undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, fields, ready, cardName, pathKey])
}
