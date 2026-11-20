/**
 * Whether the device believes it is online, behind one small adapter so the
 * rest of the code never touches `navigator` (a native app would use NetInfo).
 * "Online" is only a hint — the request itself is the real test.
 */
export function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}
