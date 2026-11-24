import { useCallback } from 'react'
import { REFLECTION_CARDS } from '@/data/reflectionCards'
import { apiListNoteEntriesForDate } from '@/api/notes'
import { fieldsForEntry } from '@/domain/activityFields'
import { rowForLoggedActivity } from '@/domain/colors'
import { assembleDayExport, type DayExportData } from '@/domain/dayExport'
import { frameDisplayName } from '@/domain/frameNames'
import { assembleLayoutExport, type LayoutExportData } from '@/domain/layoutExport'
import type { ActivityList } from '@/domain/types'
import { loadDisplayValue } from '@/lib/displayValuesLocalStore'
import { getFrame } from '@/lib/frame'
import { localDateISO, localDayRange } from '@/lib/localTime'
import { loadLocalSupplementCompletions } from '@/lib/supplementsLocalStore'
import { useSharedHeaderButtons } from './HeaderButtonsContext'
import { useOptionalPickerData } from './PickerDataContext'
import { useFrameNames } from './useFrameNames'
import { useReflectionCards } from './useReflectionCards'

export interface ExportBuilders {
  /** Everything logged on `viewedDate`, ready to render. Never rejects over the one optional network read. */
  buildDayExport: (viewedDate: Date, activities: ActivityList) => Promise<DayExportData>
  /** How the frame on screen is set up right now. Synchronous: it is all in local state. */
  buildLayoutExport: () => LayoutExportData
  /** The frame's display name, for labelling the menu. */
  frameName: string
}

function reflectionCardTitle(card: number): string {
  return REFLECTION_CARDS.find((c) => c.number === card)?.title ?? `Card ${card}`
}

/**
 * The data side of the header's download menu: gathers every source for the
 * two exports (the day summary and the layout) so the menu component stays a
 * pure screen. Assembly itself lives in `domain/dayExport.ts` and
 * `domain/layoutExport.ts`.
 */
export function useExportBuilders(): ExportBuilders {
  const picker = useOptionalPickerData()
  const { allButtons, visible, hidden, groups, tileBoard } = useSharedHeaderButtons()
  const { nameFor, rows, hiddenCards } = useReflectionCards()
  const { names } = useFrameNames()
  const frame = getFrame()
  const frameName = frameDisplayName(frame, names)

  const buildDayExport = useCallback(
    async (viewedDate: Date, activities: ActivityList): Promise<DayExportData> => {
      const dateKey = localDateISO(viewedDate)
      const { start, end } = localDayRange(viewedDate)
      // Fails open: `null` (no backend, or the read didn't reach the server) just means the notes
      // section is empty — it never blocks the rest, which is already in local state.
      const noteEntries = (await apiListNoteEntriesForDate(start, end)) ?? []

      // Quick-log minutes are computed from the day's activities; daily numbers are read from the
      // same local-first cache their button writes through (rule 6).
      const numberButtons = allButtons.filter((b) => (b.category === 'activity' && b.activityName) || b.category === 'day_value')
      const localDisplayValues: Record<string, number | null> = {}
      for (const button of numberButtons) {
        if (button.category === 'day_value') localDisplayValues[button.id] = loadDisplayValue(button.id, dateKey)
      }

      const noteFieldLabels = new Map<string, string>()
      for (const button of allButtons) for (const field of button.noteFields) noteFieldLabels.set(field.id, field.label)

      return assembleDayExport({
        viewedDate,
        activities,
        noteEntries,
        numberButtons: numberButtons.map((b) => ({ key: b.id, label: b.label })),
        localDisplayValues,
        checklists: allButtons
          .filter((b) => b.category === 'checklist')
          .map((b) => ({
            label: b.label,
            items: b.checklistItems,
            completions: loadLocalSupplementCompletions(b.id, dateKey) ?? [],
          })),
        noteFieldLabel: (fieldId) => noteFieldLabels.get(fieldId),
        reflectionCardTitle,
        fieldsForActivity: (activity) => {
          const rowsForActivities = picker?.activities.activities
          const row = rowsForActivities ? rowForLoggedActivity(rowsForActivities, activity.name, activity.path) : null
          return rowsForActivities && row && picker
            ? fieldsForEntry(picker.activityFields.fields, rowsForActivities, row.id)
            : undefined
        },
      })
    },
    [allButtons, picker],
  )

  const buildLayoutExport = useCallback(
    (): LayoutExportData =>
      assembleLayoutExport({
        frameNumber: frame,
        frameName,
        now: new Date(),
        header: { visible, hidden, groups },
        tileCategories: rows.map((row) => ({ name: row.group.name, cards: row.cards })),
        hiddenTileCards: hiddenCards,
        tileTitle: nameFor,
        boardFor: tileBoard,
      }),
    [frame, frameName, visible, hidden, groups, rows, hiddenCards, nameFor, tileBoard],
  )

  return { buildDayExport, buildLayoutExport, frameName }
}
