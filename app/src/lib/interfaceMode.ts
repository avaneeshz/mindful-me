/**
 * Which of the two interfaces this device shows once signed in: `classic`
 * (the original Today board) or `lumen` (the pastel Day/Night-strip
 * interface in `app/src/lumen/`). Both read and write the same data through
 * the same modules — this only picks the screens.
 *
 * Per-device for now (see `prototypes/lumen/SPEC.md`, Plan phase 5: a per-user
 * `user_preferences` row replaces this once that migration lands). Fail-
 * closed like every other local store in this app: unreadable or blocked
 * storage simply means Classic, never a thrown error.
 */
export type InterfaceMode = 'classic' | 'lumen'

const STORAGE_KEY = 'mindful-me:interface'

/** Classic stays the default for everyone until they opt in. */
export const DEFAULT_INTERFACE_MODE: InterfaceMode = 'classic'

export function parseInterfaceMode(raw: string | null): InterfaceMode {
  return raw === 'lumen' ? 'lumen' : DEFAULT_INTERFACE_MODE
}

export function loadInterfaceMode(): InterfaceMode {
  try {
    return parseInterfaceMode(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return DEFAULT_INTERFACE_MODE
  }
}

export function saveInterfaceMode(mode: InterfaceMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // In-memory state is still correct; only cross-reload durability is lost.
  }
}

/**
 * Lumen's stylesheet is scoped under `html.lumen` (see
 * `tailwind.lumen.config.js`), so this class is what turns it on and off.
 * Set only while Lumen is actually on screen — not merely chosen — so the
 * signed-out screen and the loading spinner keep Classic's look.
 */
export function setLumenDocumentClass(on: boolean): void {
  document.documentElement.classList.toggle('lumen', on)
}
