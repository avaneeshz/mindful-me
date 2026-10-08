import { useCallback, useEffect, useRef, useState } from 'react'
import {
  apiDeleteActivity,
  apiListActivities,
  apiProvisionDefaultActivities,
  type CreateActivityResult,
  type UpdateActivityResult,
} from '@/api/activityHierarchy'
import { ACTIVITY_CARDS, CATEGORY_ORDER } from '@/data/activities'
import { reconcileList } from '@/domain/reconcileList'
import { generateId } from '@/domain/scheduling'
import { collectSubtreeIds, type ActivityRow } from '@/domain/pickerHierarchy'
import { supabaseConfigured } from '@/lib/supabaseClient'
import { overlayActivities } from './pendingOverlay'
import { getPendingIds, getPendingWritesSnapshot, writeThrough } from './pendingWrites'

export type ActivityHierarchyStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface UseActivityHierarchyResult {
  activities: ActivityRow[]
  status: ActivityHierarchyStatus
  error: string | null
  addActivity: (input: { name: string; tileId?: string | null; parentId?: string | null }) => ActivityRow
  renameActivity: (id: string, name: string) => void
  /** A built-in icon key or an uploaded icon (`custom:<id>`). */
  setActivityIcon: (id: string, iconKey: string) => void
  /** `null` clears the activity's own colour so it inherits again. */
  setActivityColor: (id: string, color: string | null) => void
  /** Titles this activity's own notes; `second` null removes the second note. */
  setActivityNoteLabels: (id: string, first: string | null, second: string | null) => void
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
      // Never let the server's list erase a change it hasn't confirmed yet.
      const pending = getPendingIds('activity')
      const unconfirmed = getPendingWritesSnapshot()
      setActivities((prev) =>
        reconcileList(prev, overlayActivities(server, unconfirmed), pending.save, pending.delete, (a) => a.id),
      )
      setStatus('ready')
    }

    void loadAndProvisionIfNeeded()
    return () => {
      cancelled = true
    }
  }, [])

  // Removes a node AND every descendant already added under it locally —
  // shared by `deleteActivity` (a real server-confirmed delete cascades to
  // the whole subtree server-side too) and `addActivity`'s own
  // `duplicate_name` rollback below (found in code review: rolling back
  // just the rejected parent left any sub-activity the user had already
  // added under it, before the rejection came back, as an invisible orphan
  // referencing a `parentId` that no longer exists).
  const removeSubtreeLocally = useCallback((id: string): void => {
    // `collectSubtreeIds` (found in code review: this used to hand-roll the
    // exact same fixed-point walk `pickerHierarchy.ts` already provides,
    // tested, and this file's own sibling `ActivityLibraryPanel.tsx` already
    // uses) already returns `id` itself plus every descendant.
    setActivities((prev) => {
      const removed = new Set(collectSubtreeIds(prev, id))
      return prev.filter((a) => !removed.has(a.id))
    })
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
        void writeThrough<CreateActivityResult>({
          action: 'activity.create',
          entity: 'activity',
          recordId: id,
          op: 'save',
          args: [{ id, name: input.name, tileId: input.tileId, parentId: input.parentId }],
          label: `Add activity “${input.name}”`,
        }).then((out) => {
          if (out.status === 'ok') return
          if (out.status === 'rejected') {
            // A PERMANENT rejection, not a transient one — a retry of the same
            // name can never succeed, so roll the optimistic insert back (and
            // any sub-activity already added under it) instead of leaving a
            // phantom behind. The attempt is already out of the retry ledger.
            removeSubtreeLocally(id)
            setError(`"${input.name}" is already the name of one of your other activities — try a different name.`)
            return
          }
          setError('Saved on this device — will sync once you’re back online.')
        })
      }
      return created
    },
    [activities, removeSubtreeLocally],
  )

  const renameActivity = useCallback((id: string, name: string): void => {
    // Captured so a permanent `duplicate_name` rejection (see `addActivity`'s
    // own comment on why that case is handled differently) can revert this
    // rename instead of leaving the local copy showing a name the server
    // never actually accepted.
    let previousName: string | undefined
    setActivities((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a
        previousName = a.name
        return { ...a, name }
      }),
    )
    if (supabaseConfigured) {
      void writeThrough<UpdateActivityResult>({
        action: 'activity.update',
        entity: 'activity',
        recordId: id,
        op: 'save',
        args: [id, name],
        label: `Rename activity to “${name}”`,
      }).then((out) => {
        if (out.status === 'ok') return
        if (out.status === 'rejected') {
          // A stale in-flight rejection must never clobber a NEWER rename the
          // user already made — only revert if the row's name is still exactly
          // what THIS attempt set it to.
          if (previousName !== undefined) {
            setActivities((prev) =>
              prev.map((a) => (a.id === id && a.name === name ? { ...a, name: previousName! } : a)),
            )
          }
          setError(`"${name}" is already the name of one of your other activities — try a different name.`)
          return
        }
        setError('Saved on this device — will sync once you’re back online.')
      })
    }
  }, [])

  const setActivityColor = useCallback((id: string, color: string | null): void => {
    setActivities((prev) => prev.map((a) => (a.id === id ? { ...a, color } : a)))
    if (supabaseConfigured) {
      void writeThrough({ action: 'activity.setColor', entity: 'activity', recordId: id, op: 'save', args: [id, color], label: `Set activity colour${color ? ` ${color}` : ' to default'}`, coalesce: true }).then(
        (out) => {
          if (out.status !== 'ok') setError('Saved on this device — will sync once you’re back online.')
        },
      )
    }
  }, [])

  const setActivityIcon = useCallback(
    (id: string, iconKey: string): void => {
      const row = activities.find((a) => a.id === id)
      if (!row) return
      setActivities((prev) => prev.map((a) => (a.id === id ? { ...a, iconKey } : a)))
      if (supabaseConfigured) {
        void writeThrough({ action: 'activity.update', entity: 'activity', recordId: id, op: 'save', args: [id, row.name, iconKey], label: `Change icon of “${row.name}”` }).then(
          (out) => {
            if (out.status !== 'ok') setError('Saved on this device — will sync once you’re back online.')
          },
        )
      }
    },
    [activities],
  )

  const setActivityNoteLabels = useCallback((id: string, first: string | null, second: string | null): void => {
    setActivities((prev) => prev.map((a) => (a.id === id ? { ...a, noteLabel: first, secondNoteLabel: second } : a)))
    if (supabaseConfigured) {
      void writeThrough({ action: 'activity.setNoteLabels', entity: 'activity', recordId: id, op: 'save', args: [id, first, second], label: `Set note titles: ${[first, second].filter(Boolean).join(', ') || '(none)'}`, coalesce: true }).then(
        (out) => {
          if (out.status !== 'ok') setError('Saved on this device — will sync once you’re back online.')
        },
      )
    }
  }, [])

  const setHidden = useCallback((id: string, hidden: boolean): void => {
    setActivities((prev) => prev.map((a) => (a.id === id ? { ...a, hidden } : a)))
    if (supabaseConfigured) {
      void writeThrough({ action: 'activity.setHidden', entity: 'activity', recordId: id, op: 'save', args: [id, hidden], label: `${hidden ? 'Hide' : 'Restore'} an activity`, coalesce: true }).then(
        (out) => {
          if (out.status !== 'ok') setError('Saved on this device — will sync once you’re back online.')
        },
      )
    }
  }, [])

  const hideActivity = useCallback((id: string) => setHidden(id, true), [setHidden])
  const unhideActivity = useCallback((id: string) => setHidden(id, false), [setHidden])

  const reorder = useCallback((orderedIds: string[]): void => {
    const orderIndex = new Map(orderedIds.map((id, index) => [id, index]))
    setActivities((prev) => prev.map((a) => (orderIndex.has(a.id) ? { ...a, sortOrder: orderIndex.get(a.id)! } : a)))
    if (supabaseConfigured) {
      void writeThrough({ action: 'activity.reorder', entity: 'activity', recordId: 'order', op: 'save', args: [orderedIds], label: 'Reorder activities', coalesce: true }).then(
        (out) => {
          if (out.status !== 'ok') setError('Saved on this device — will sync once you’re back online.')
        },
      )
    }
  }, [])

  const deleteActivity = useCallback(
    async (id: string): Promise<{ ok: true } | { ok: false; reason: 'has_history' | 'unreachable' }> => {
      // Zero backend configured (rule 6): every OTHER mutation here
      // (add/rename/hide/reorder) updates local state unconditionally —
      // delete used to be the one exception, returning an `'unreachable'`
      // error that implied a transient problem a retry could fix, when in
      // this mode it never can (found in review). There's no real
      // server-side history to check in this mode either, so the delete
      // always succeeds locally, consistent with the rest of the preview.
      if (!supabaseConfigured) {
        removeSubtreeLocally(id)
        return { ok: true }
      }
      const result = await apiDeleteActivity(id)
      if (result.ok) removeSubtreeLocally(id)
      return result
    },
    [removeSubtreeLocally],
  )

  return { activities, status, error, addActivity, renameActivity, setActivityIcon, setActivityColor, setActivityNoteLabels, hideActivity, unhideActivity, reorder, deleteActivity }
}
