/**
 * Whether the app is in front of the person, behind one small adapter so the
 * rest of the code never touches `document` directly (a native app would swap
 * this for its AppState API).
 */
export function isAppVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden'
}

/** Calls `onChange(visible)` whenever the app is shown or hidden. Returns an unsubscribe. */
export function onAppVisibilityChange(onChange: (visible: boolean) => void): () => void {
  if (typeof document === 'undefined') return () => {}
  const handler = () => onChange(document.visibilityState !== 'hidden')
  document.addEventListener('visibilitychange', handler)
  return () => document.removeEventListener('visibilitychange', handler)
}
