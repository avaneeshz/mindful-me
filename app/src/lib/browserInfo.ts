/**
 * What the app needs to know about the browser it is running in, behind one
 * adapter (MOBILE-READINESS.md: browser-only APIs live behind a small
 * adapter). On a future native app only this file changes.
 */

function userAgent(): string {
  return typeof navigator === 'undefined' ? '' : navigator.userAgent
}

function installedToHomeScreen(): boolean {
  try {
    const nav = navigator as Navigator & { standalone?: boolean }
    return nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true
  } catch {
    return false
  }
}

/**
 * True for Safari — and every browser on iPhone/iPad, which all use Safari's
 * engine and its storage rules — when running as a normal web page. Safari may
 * delete a website's stored data after about 7 days without use. An app added
 * to the Home Screen is exempt from that rule.
 */
export function isStorageEvictionRisk(): boolean {
  const ua = userAgent()
  if (installedToHomeScreen()) return false
  const iOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1)
  const desktopSafari = /Safari\//.test(ua) && !/Chrome|Chromium|Edg|OPR|Android|Firefox/.test(ua)
  return iOS || desktopSafari
}

/** Firefox shows the user a permission prompt when a site asks for protected storage — don't surprise them with one. */
export function persistRequestMayPrompt(): boolean {
  return /Firefox|FxiOS/.test(userAgent())
}
