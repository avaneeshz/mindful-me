import { useSyncExternalStore } from 'react'

/** Matches Tailwind's `mobile` screen (`max: 768px`) — the one width below which edit popovers become bottom sheets. */
const QUERY = '(max-width: 768px)'

function subscribe(onChange: () => void): () => void {
  try {
    const list = window.matchMedia(QUERY)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  } catch {
    return () => {}
  }
}

function getSnapshot(): boolean {
  try {
    return window.matchMedia(QUERY).matches
  } catch {
    return false
  }
}

/** The browser's media-query API behind one small adapter (portability rule 2). Server render and any failure read as "not mobile". */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
