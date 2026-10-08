import { useCallback, useEffect, useState } from 'react'
import { apiCreateCustomIcon, apiDeleteCustomIcon, apiListCustomIcons } from '@/api/customIcons'
import type { CustomIcon } from '@/domain/customIcons'
import { generateId } from '@/domain/scheduling'
import { setCustomIcons } from '@/lib/iconRegistry'
import { supabaseConfigured } from '@/lib/supabaseClient'

export type CustomIconsStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface UseCustomIconsResult {
  icons: CustomIcon[]
  status: CustomIconsStatus
  /** Uploads need an account: icons are stored on the server so every device sees them. */
  canUpload: boolean
  /** Saves an approved silhouette. Resolves to the new icon, or an error message. */
  addIcon: (imageData: string) => Promise<{ ok: true; icon: CustomIcon } | { ok: false; message: string }>
  /** Deletes an uploaded icon. Refused while a tile or activity still uses it. */
  deleteIcon: (id: string) => Promise<{ ok: true } | { ok: false; message: string }>
}

/**
 * The user's uploaded icons. Unlike most data here this is server-first, not
 * local-first: an icon is only useful once every device can show it, so an
 * upload waits for the server to accept it before it can be picked. The
 * loaded list is pushed into `lib/iconRegistry.ts` so any `resolveIcon`
 * call can draw it.
 */
export function useCustomIcons(): UseCustomIconsResult {
  const [icons, setIcons] = useState<CustomIcon[]>([])
  const [status, setStatus] = useState<CustomIconsStatus>('idle')

  useEffect(() => {
    if (!supabaseConfigured) return
    let cancelled = false
    setStatus('loading')
    void apiListCustomIcons().then((list) => {
      if (cancelled) return
      if (list === null) {
        setStatus('error')
        return
      }
      setIcons(list)
      setStatus('ready')
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setCustomIcons(icons)
  }, [icons])

  const addIcon = useCallback(async (imageData: string) => {
    const id = generateId()
    const result = await apiCreateCustomIcon(id, imageData)
    if (!result.ok) {
      const message =
        result.reason === 'limit_reached'
          ? 'You’ve reached 200 uploaded icons. Delete one you no longer use first.'
          : result.reason === 'invalid'
            ? 'This icon couldn’t be saved. Try a different image.'
            : 'Couldn’t upload right now. Check your connection and try again.'
      return { ok: false as const, message }
    }
    const icon = { id, imageData }
    setIcons((prev) => [...prev, icon])
    return { ok: true as const, icon }
  }, [])

  const deleteIcon = useCallback(async (id: string) => {
    const result = await apiDeleteCustomIcon(id)
    if (!result.ok) {
      return {
        ok: false as const,
        message:
          result.reason === 'in_use'
            ? 'A tile or activity still uses this icon. Give it a different icon first.'
            : 'Couldn’t delete right now. Check your connection and try again.',
      }
    }
    setIcons((prev) => prev.filter((icon) => icon.id !== id))
    return { ok: true as const }
  }, [])

  return { icons, status, canUpload: supabaseConfigured, addIcon, deleteIcon }
}
