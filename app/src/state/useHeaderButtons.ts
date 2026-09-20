import { useCallback, useEffect, useRef, useState } from 'react'
import {
  apiCreateHeaderButton,
  apiListHeaderButtons,
  apiReorderHeaderButtons,
  apiSetHeaderButtonHidden,
  apiUpdateHeaderButton,
  type CreateHeaderButtonInput,
  type UpdateHeaderButtonInput,
} from '@/api/headerButtons'
import { DEFAULT_HEADER_BUTTONS, partitionHeaderButtons, type HeaderButtonConfig } from '@/domain/headerButtons'
import { generateId } from '@/domain/scheduling'
import { loadLocalHeaderButtons, saveLocalHeaderButtons } from '@/lib/headerButtonsLocalStore'
import { supabaseConfigured } from '@/lib/supabaseClient'

export type HeaderButtonsStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface UseHeaderButtonsResult {
  /** This user's effective button list, in their own chosen order — what the header row renders. */
  visible: HeaderButtonConfig[]
  /** Hidden buttons (system defaults this user hid, or their own buttons they hid) — edit mode's own "Hidden" section, so a hide is never a dead end. */
  hidden: HeaderButtonConfig[]
  status: HeaderButtonsStatus
  error: string | null
  addButton: (input: Omit<CreateHeaderButtonInput, 'id'>) => HeaderButtonConfig
  updateButton: (input: UpdateHeaderButtonInput & { category: HeaderButtonConfig['category'] }) => void
  hideButton: (id: string) => void
  unhideButton: (id: string) => void
  /** One full reorder (the whole visible list's new order), not a per-row move — see `reorder_header_buttons`'s own doc comment. */
  reorder: (orderedIds: string[]) => void
}

/**
 * The effective per-user header-button list: local-first (rule 6, same as
 * every other control in this app) with a background sync, generalizing
 * `useNoteEntries`/`useDailyValue`'s own "local cache instant, server
 * reconciles once it answers" shape from one control's data to the set of
 * controls itself. Starts from `DEFAULT_HEADER_BUTTONS` (or this device's
 * own last-known snapshot) so the header renders instantly with zero
 * backend configured — additive capability, never a blocking fetch.
 */
export function useHeaderButtons(): UseHeaderButtonsResult {
  const [all, setAll] = useState<HeaderButtonConfig[]>(() => loadLocalHeaderButtons() ?? [...DEFAULT_HEADER_BUTTONS])
  const [status, setStatus] = useState<HeaderButtonsStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const hasFetchedRef = useRef(false)

  useEffect(() => {
    if (hasFetchedRef.current) return
    if (!supabaseConfigured) {
      setStatus('ready')
      return
    }
    hasFetchedRef.current = true
    let cancelled = false
    setStatus('loading')
    apiListHeaderButtons().then((server) => {
      if (cancelled) return
      if (server === null) {
        setStatus('error')
        setError('Could not load your header buttons — showing what’s saved on this device.')
        return
      }
      // Server wins once it answers — same reconciliation shape
      // `useNoteEntries`/`useDailyValue` already follow.
      setAll(server)
      saveLocalHeaderButtons(server)
      setStatus('ready')
    })
    return () => {
      cancelled = true
    }
  }, [])

  function commit(next: HeaderButtonConfig[]): void {
    setAll(next)
    saveLocalHeaderButtons(next)
  }

  const addButton = useCallback(
    (input: Omit<CreateHeaderButtonInput, 'id'>): HeaderButtonConfig => {
      const id = generateId()
      const maxSortOrder = all.reduce((max, b) => Math.max(max, b.sortOrder), -1)
      const created: HeaderButtonConfig = {
        id,
        category: input.category,
        key: input.key ?? null,
        label: input.label,
        isSystemDefault: false,
        hidden: false,
        sortOrder: maxSortOrder + 1,
        activityId: input.activityId ?? null,
        activityName: null,
        entryMode: input.entryMode ?? 'duration',
        quickLogType: input.quickLogType ?? false,
        quickLogTypeLabel: input.quickLogTypeLabel ?? 'Type',
        quickLogSleepQuality: input.quickLogSleepQuality ?? false,
        noteFields: input.noteFields ?? [],
        dayValueUnit: input.dayValueUnit ?? null,
        dayValueTarget: input.dayValueTarget ?? null,
        noteTypes: input.noteTypes ?? [],
        checklistItems: (input.checklistItems ?? []).map((item, index) => ({
          key: `item_${index}_${id.slice(0, 8)}`,
          label: item.label,
        })),
      }
      commit([...all, created])

      if (supabaseConfigured) {
        void apiCreateHeaderButton({ ...input, id }).then((serverId) => {
          if (serverId === null) {
            setError('Saved on this device — will sync once you’re back online.')
          }
        })
      }

      return created
    },
    [all],
  )

  const updateButton = useCallback(
    (input: UpdateHeaderButtonInput & { category: HeaderButtonConfig['category'] }): void => {
      const next = all.map((button) => {
        if (button.id !== input.id) return button
        return {
          ...button,
          label: input.label,
          quickLogTypeLabel: input.quickLogTypeLabel ?? button.quickLogTypeLabel,
          quickLogSleepQuality: input.quickLogSleepQuality ?? button.quickLogSleepQuality,
          dayValueTarget: input.dayValueTarget ?? button.dayValueTarget,
          noteFields: input.noteFields ?? button.noteFields,
          noteTypes: input.noteTypes ?? button.noteTypes,
          checklistItems: input.checklistItems
            ? input.checklistItems.map((item, index) => ({
                key: item.key ?? `item_${index}_${input.id.slice(0, 8)}_${Date.now()}`,
                label: item.label,
              }))
            : button.checklistItems,
        }
      })
      commit(next)

      if (supabaseConfigured) {
        void apiUpdateHeaderButton(input).then((ok) => {
          if (!ok) setError('Saved on this device — will sync once you’re back online.')
        })
      }
    },
    [all],
  )

  const setHidden = useCallback(
    (id: string, hidden: boolean): void => {
      commit(all.map((button) => (button.id === id ? { ...button, hidden } : button)))
      if (supabaseConfigured) {
        void apiSetHeaderButtonHidden(id, hidden).then((ok) => {
          if (!ok) setError('Saved on this device — will sync once you’re back online.')
        })
      }
    },
    [all],
  )

  const hideButton = useCallback((id: string) => setHidden(id, true), [setHidden])
  const unhideButton = useCallback((id: string) => setHidden(id, false), [setHidden])

  const reorder = useCallback(
    (orderedIds: string[]): void => {
      const orderIndex = new Map(orderedIds.map((id, index) => [id, index]))
      const next = all.map((button) =>
        orderIndex.has(button.id) ? { ...button, sortOrder: orderIndex.get(button.id)! } : button,
      )
      commit(next)
      if (supabaseConfigured) {
        void apiReorderHeaderButtons(orderedIds).then((ok) => {
          if (!ok) setError('Saved on this device — will sync once you’re back online.')
        })
      }
    },
    [all],
  )

  const { visible, hidden } = partitionHeaderButtons(all)

  return { visible, hidden, status, error, addButton, updateButton, hideButton, unhideButton, reorder }
}
