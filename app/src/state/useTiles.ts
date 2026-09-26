import { useCallback, useEffect, useRef, useState } from 'react'
import {
  apiCreateTile,
  apiDeleteTile,
  apiListTiles,
  apiProvisionDefaultTiles,
  apiReorderTiles,
  apiSetTileHidden,
  apiUpdateTile,
  type TileDto,
} from '@/api/tiles'
import { CATEGORIES, CATEGORY_ORDER } from '@/data/activities'
import type { CategoryId } from '@/domain/types'
import { generateId } from '@/domain/scheduling'
import { supabaseConfigured } from '@/lib/supabaseClient'

/** Matches `provision_default_tiles()`'s own seed exactly (`20260924060000_tiles.sql`) — Lucide icon names can't be recovered from `CATEGORIES[id].icon` (a component reference, not a stable string), so this is the one place both have to be kept in sync by hand. */
const LOCAL_ONLY_TILE_ICON: Record<CategoryId, string> = {
  sleep: 'Moon',
  food: 'Utensils',
  care: 'Droplet',
  downtime: 'Tv',
  movement: 'Footprints',
  work: 'Rocket',
  nature: 'Leaf',
  growth: 'Sparkles',
  home: 'Home',
}

export type TilesStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface UseTilesResult {
  tiles: TileDto[]
  status: TilesStatus
  error: string | null
  addTile: (label: string, iconKey: string) => TileDto
  renameTile: (id: string, label: string, iconKey: string) => void
  hideTile: (id: string) => void
  unhideTile: (id: string) => void
  reorder: (orderedIds: string[]) => void
  /** Resolves once the server has confirmed the delete. See `apiDeleteTile`'s `reason` for why it might not have happened. */
  deleteTile: (id: string) => Promise<{ ok: true } | { ok: false; reason: 'has_history' | 'unreachable' }>
}

/** A read-only preview built from the legacy static catalog, so the editor is still meaningfully usable with zero backend configured (rule 6) — mutations here only ever touch in-memory state for the session; there is nowhere to persist them without a real `tiles` table. */
function localOnlyDefaults(): TileDto[] {
  return CATEGORY_ORDER.map((id, index) => ({
    id,
    label: CATEGORIES[id].label,
    iconKey: LOCAL_ONLY_TILE_ICON[id],
    sortOrder: index,
    hidden: false,
  }))
}

/**
 * The effective per-user tile list: fetched from the server with a
 * one-time provision-on-empty bootstrap (mirrors `useHeaderButtons`'s own
 * shape exactly), or a static read-only preview with zero backend
 * configured. Optimistic local updates on every mutation — this is a
 * settings surface, not the fast primary logging path `BoardContext`
 * protects, so unlike `useHeaderButtons` it does not also mirror into
 * `localStorage`; a reload simply re-fetches from the server.
 */
export function useTiles(): UseTilesResult {
  const [tiles, setTiles] = useState<TileDto[]>(() => (supabaseConfigured ? [] : localOnlyDefaults()))
  const [status, setStatus] = useState<TilesStatus>('idle')
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
      let server = await apiListTiles()
      if (cancelled) return
      if (server === null) {
        setStatus('error')
        setError('Could not load your tiles right now.')
        return
      }
      if (server.length === 0) {
        const provisioned = await apiProvisionDefaultTiles()
        if (cancelled) return
        if (provisioned) {
          server = await apiListTiles()
          if (cancelled) return
        }
      }
      if (server === null) {
        setStatus('error')
        setError('Could not load your tiles right now.')
        return
      }
      setTiles(server)
      setStatus('ready')
    }

    void loadAndProvisionIfNeeded()
    return () => {
      cancelled = true
    }
  }, [])

  const addTile = useCallback(
    (label: string, iconKey: string): TileDto => {
      const id = generateId()
      const maxSortOrder = tiles.reduce((max, t) => Math.max(max, t.sortOrder), -1)
      const created: TileDto = { id, label, iconKey, sortOrder: maxSortOrder + 1, hidden: false }
      setTiles((prev) => [...prev, created])
      if (supabaseConfigured) {
        void apiCreateTile(id, label, iconKey).then((serverId) => {
          if (serverId === null) setError('Saved on this device — will sync once you’re back online.')
        })
      }
      return created
    },
    [tiles],
  )

  const renameTile = useCallback((id: string, label: string, iconKey: string): void => {
    setTiles((prev) => prev.map((t) => (t.id === id ? { ...t, label, iconKey } : t)))
    if (supabaseConfigured) {
      void apiUpdateTile(id, label, iconKey).then((ok) => {
        if (!ok) setError('Saved on this device — will sync once you’re back online.')
      })
    }
  }, [])

  const setHidden = useCallback((id: string, hidden: boolean): void => {
    setTiles((prev) => prev.map((t) => (t.id === id ? { ...t, hidden } : t)))
    if (supabaseConfigured) {
      void apiSetTileHidden(id, hidden).then((ok) => {
        if (!ok) setError('Saved on this device — will sync once you’re back online.')
      })
    }
  }, [])

  const hideTile = useCallback((id: string) => setHidden(id, true), [setHidden])
  const unhideTile = useCallback((id: string) => setHidden(id, false), [setHidden])

  const reorder = useCallback((orderedIds: string[]): void => {
    const orderIndex = new Map(orderedIds.map((id, index) => [id, index]))
    setTiles((prev) => prev.map((t) => (orderIndex.has(t.id) ? { ...t, sortOrder: orderIndex.get(t.id)! } : t)))
    if (supabaseConfigured) {
      void apiReorderTiles(orderedIds).then((ok) => {
        if (!ok) setError('Saved on this device — will sync once you’re back online.')
      })
    }
  }, [])

  const deleteTile = useCallback(
    async (id: string): Promise<{ ok: true } | { ok: false; reason: 'has_history' | 'unreachable' }> => {
      // Zero backend configured (rule 6): every OTHER mutation here
      // (add/rename/hide/reorder) updates local state unconditionally —
      // delete used to be the one exception, returning an `'unreachable'`
      // error that implied a transient problem a retry could fix, when in
      // this mode it never can (found in review). There's no real
      // server-side history to check in this mode either, so the delete
      // always succeeds locally, consistent with the rest of the preview.
      if (!supabaseConfigured) {
        setTiles((prev) => prev.filter((t) => t.id !== id))
        return { ok: true }
      }
      const result = await apiDeleteTile(id)
      if (result.ok) setTiles((prev) => prev.filter((t) => t.id !== id))
      return result
    },
    [],
  )

  return { tiles, status, error, addTile, renameTile, hideTile, unhideTile, reorder, deleteTile }
}
