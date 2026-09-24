import { useCallback, useEffect, useRef, useState } from 'react'
import {
  apiCreateActivity,
  apiDeleteActivity,
  apiListActivities,
  apiProvisionDefaultActivities,
  apiReorderActivities,
  apiSetActivityHidden,
  apiUpdateActivity,
} from '@/api/activityHierarchy'
import { ACTIVITY_CARDS, CATEGORY_ORDER } from '@/data/activities'
import { generateId } from '@/domain/scheduling'
import type { ActivityRow } from '@/domain/pickerHierarchy'
import { supabaseConfigured } from '@/lib/supabaseClient'

export type ActivityHierarchyStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface UseActivityHierarchyResult {
  activities: ActivityRow[]
  status: ActivityHierarchyStatus
  error: string | null
  addActivity: (input: { name: string; tileId?: string | null; parentId?: string | null }) => ActivityRow
  renameActivity: (id: string, name: string) => void
  hideActivity: (id: string) => void
  unhideActivity: (id: string) => void
  reorder: (orderedIds: string[]) => void
  deleteActivity: (id: string) => Promise<{ ok: true } | { ok: false; reason: 'has_history' | 'unreachable' }>
}

/** Read-only preview from the legacy static catalog, same rationale as `useTiles`'s `localOnlyDefaults` — usable with zero backend (rule 6), but mutations don't persist anywhere without a real `activities` row. Reuses `ACTIVITY_CARDS`' own `sub`/`third` shape, generating stable synthetic ids by path rather than real uuids (never sent anywhere). */
function localOnlyDefaults(): ActivityRow[] {
  const rows: ActivityRow[] = []
  const order: Partial<Record<string, number>> = {}
  const nextOrder = (key: string): number => {
    const value = (order[key] ?? -1) + 1
    order[key] = value
    return value
  }

  for (const card of ACTIVITY_CARDS) {
    const topId = `local:${card.name}`
    rows.push({
      id: topId,
      name: card.name,
      tileId: card.categoryId,
      parentId: null,
      iconKey: null,
      hidden: false,
      sortOrder: nextOrder(card.categoryId),
      disappearMode: card.disappear.mode === 'auto' ? 'auto' : 'manual',
      disappearLimit: card.disappear.mode === 'auto' ? card.disappear.limit : null,
    })
    for (const sub of card.sub ?? []) {
      const subId = `local:${card.name}/${sub}`
      rows.push({
        id: subId,
        name: sub,
        tileId: null,
        parentId: topId,
        iconKey: null,
        hidden: false,
        sortOrder: nextOrder(topId),
        disappearMode: 'manual',
        disappearLimit: null,
      })
      for (const third of card.third?.[sub] ?? []) {
        rows.push({
          id: `local:${card.name}/${sub}/${third}`,
          name: third,
          tileId: null,
          parentId: subId,
          iconKey: null,
          hidden: false,
          sortOrder: nextOrder(subId),
          disappearMode: 'manual',
          disappearLimit: null,
        })
      }
    }
  }
  // CATEGORY_ORDER unused directly here (tile grouping already comes from
  // card.categoryId matching each local-only tile's own id) — imported only
  // so a future reviewer can see at a glance this stays in sync with the
  // same 9 ids `useTiles`'s own local-only preview uses.
  void CATEGORY_ORDER
  return rows
}

/**
 * The effective per-user activity tree, flat (see `domain/pickerHierarchy.ts`
 * for turning this into a per-tile tree). Same shape as `useTiles`: fetch +
 * provision-on-empty from the server, optimistic in-memory updates, a static
 * read-only preview with zero backend configured.
 */
export function useActivityHierarchy(): UseActivityHierarchyResult {
  const [activities, setActivities] = useState<ActivityRow[]>(() => (supabaseConfigured ? [] : localOnlyDefaults()))
  const [status, setStatus] = useState<ActivityHierarchyStatus>('idle')
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

    async function loadAndProvisionIfNeeded(): Promise<void> {
      let server = await apiListActivities()
      if (cancelled) return
      if (server === null) {
        setStatus('error')
        setError('Could not load your activities right now.')
        return
      }
      if (server.length === 0) {
        const provisioned = await apiProvisionDefaultActivities()
        if (cancelled) return
        if (provisioned) {
          server = await apiListActivities()
          if (cancelled) return
        }
      }
      if (server === null) {
        setStatus('error')
        setError('Could not load your activities right now.')
        return
      }
      setActivities(server)
      setStatus('ready')
    }

    void loadAndProvisionIfNeeded()
    return () => {
      cancelled = true
    }
  }, [])

  const addActivity = useCallback(
    (input: { name: string; tileId?: string | null; parentId?: string | null }): ActivityRow => {
      const id = generateId()
      const siblings = activities.filter(
        (a) => a.tileId === (input.tileId ?? null) && a.parentId === (input.parentId ?? null),
      )
      const maxSortOrder = siblings.reduce((max, a) => Math.max(max, a.sortOrder), -1)
      const created: ActivityRow = {
        id,
        name: input.name,
        tileId: input.tileId ?? null,
        parentId: input.parentId ?? null,
        iconKey: null,
        hidden: false,
        sortOrder: maxSortOrder + 1,
        // No disappear-rule editing UI yet (deferred — see BACKLOG.md); every
        // newly-created activity starts `manual` (never auto-hides), the
        // same safe default the server applies.
        disappearMode: 'manual',
        disappearLimit: null,
      }
      setActivities((prev) => [...prev, created])
      if (supabaseConfigured) {
        void apiCreateActivity({ id, name: input.name, tileId: input.tileId, parentId: input.parentId }).then(
          (serverId) => {
            if (serverId === null) setError('Saved on this device — will sync once you’re back online.')
          },
        )
      }
      return created
    },
    [activities],
  )

  const renameActivity = useCallback((id: string, name: string): void => {
    setActivities((prev) => prev.map((a) => (a.id === id ? { ...a, name } : a)))
    if (supabaseConfigured) {
      void apiUpdateActivity(id, name).then((ok) => {
        if (!ok) setError('Saved on this device — will sync once you’re back online.')
      })
    }
  }, [])

  const setHidden = useCallback((id: string, hidden: boolean): void => {
    setActivities((prev) => prev.map((a) => (a.id === id ? { ...a, hidden } : a)))
    if (supabaseConfigured) {
      void apiSetActivityHidden(id, hidden).then((ok) => {
        if (!ok) setError('Saved on this device — will sync once you’re back online.')
      })
    }
  }, [])

  const hideActivity = useCallback((id: string) => setHidden(id, true), [setHidden])
  const unhideActivity = useCallback((id: string) => setHidden(id, false), [setHidden])

  const reorder = useCallback((orderedIds: string[]): void => {
    const orderIndex = new Map(orderedIds.map((id, index) => [id, index]))
    setActivities((prev) => prev.map((a) => (orderIndex.has(a.id) ? { ...a, sortOrder: orderIndex.get(a.id)! } : a)))
    if (supabaseConfigured) {
      void apiReorderActivities(orderedIds).then((ok) => {
        if (!ok) setError('Saved on this device — will sync once you’re back online.')
      })
    }
  }, [])

  const deleteActivity = useCallback(
    async (id: string): Promise<{ ok: true } | { ok: false; reason: 'has_history' | 'unreachable' }> => {
      if (!supabaseConfigured) return { ok: false, reason: 'unreachable' }
      const result = await apiDeleteActivity(id)
      if (result.ok) {
        // A successful delete also cascades to every descendant server-side
        // (rule: activity_has_history already covered the whole subtree) —
        // drop them locally too rather than waiting for a refetch.
        setActivities((prev) => {
          const removed = new Set<string>([id])
          let changed = true
          while (changed) {
            changed = false
            for (const a of prev) {
              if (a.parentId && removed.has(a.parentId) && !removed.has(a.id)) {
                removed.add(a.id)
                changed = true
              }
            }
          }
          return prev.filter((a) => !removed.has(a.id))
        })
      }
      return result
    },
    [],
  )

  return { activities, status, error, addActivity, renameActivity, hideActivity, unhideActivity, reorder, deleteActivity }
}
