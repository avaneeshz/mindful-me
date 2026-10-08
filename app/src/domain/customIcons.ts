/**
 * Uploaded icons (#15) — the rules, as pure functions. The browser-only
 * parts (reading the file, drawing to a canvas) live in `lib/iconImage.ts`;
 * the backend enforces the same limits in `create_custom_icon`.
 */

export interface CustomIcon {
  id: string
  /** A 128x128 PNG data URL: a transparent background and an opaque silhouette. */
  imageData: string
}

const CUSTOM_PREFIX = 'custom:'

/** The `icon_key` a tile or activity stores to use an uploaded icon. */
export function customIconKey(id: string): string {
  return `${CUSTOM_PREFIX}${id}`
}

/** The uploaded icon's id, or `null` for a built-in icon key. */
export function customIconIdFromKey(iconKey: string | null | undefined): string | null {
  return iconKey && iconKey.startsWith(CUSTOM_PREFIX) ? iconKey.slice(CUSTOM_PREFIX.length) : null
}

/** What we ask for, shown to the user in the upload panel. */
export const ICON_UPLOAD_RULES = {
  types: ['image/png', 'image/svg+xml'] as const,
  maxBytes: 200 * 1024,
  minPixels: 128,
  /** Width and height may differ by at most this fraction and still count as square. */
  squareTolerance: 0.02,
  /** Every stored icon is resized to this square. */
  outputPixels: 128,
}

export const ICON_UPLOAD_REQUIREMENTS = [
  'PNG or SVG',
  'Square (1:1)',
  'At least 128 × 128 px (PNG)',
  'Up to 200 KB',
  'Transparent or plain single-colour background',
]

export type IconFileProblem = 'type' | 'size' | 'notSquare' | 'tooSmall'

export const ICON_FILE_PROBLEM_TEXT: Record<IconFileProblem, string> = {
  type: 'Use a PNG or SVG file.',
  size: 'This file is over 200 KB. Use a smaller one.',
  notSquare: 'This image isn’t square. Crop it to 1:1 first.',
  tooSmall: 'This image is smaller than 128 × 128 px. Use a larger one.',
}

/** Checks a file's type and size before it is decoded. */
export function checkIconFile(file: { type: string; size: number }): IconFileProblem | null {
  if (!(ICON_UPLOAD_RULES.types as readonly string[]).includes(file.type)) return 'type'
  if (file.size > ICON_UPLOAD_RULES.maxBytes) return 'size'
  return null
}

/** Checks decoded dimensions. SVGs are vectors, so only their shape matters. */
export function checkIconDimensions(width: number, height: number, isVector: boolean): IconFileProblem | null {
  if (width <= 0 || height <= 0) return 'notSquare'
  const ratio = width / height
  if (Math.abs(ratio - 1) > ICON_UPLOAD_RULES.squareTolerance) return 'notSquare'
  if (!isVector && Math.min(width, height) < ICON_UPLOAD_RULES.minPixels) return 'tooSmall'
  return null
}

/** Colour distance (0–441) under which a pixel counts as background. */
const BG_HARD = 40
/** Between HARD and SOFT a pixel is partly see-through, which keeps edges smooth. */
const BG_SOFT = 90

export type BackgroundResult = 'alreadyTransparent' | 'removed' | 'noPlainBackground'

/**
 * Removes a plain background in place. `rgba` is a row-major RGBA buffer.
 *
 * - If the border already has see-through pixels, the image is treated as
 *   already transparent and left as it is.
 * - Otherwise the colour of the four corners is the background, if they
 *   agree. Every pixel connected to the border whose colour is close to it
 *   becomes transparent (a flood fill, so the same colour inside the shape
 *   survives). Edge pixels fade out rather than cutting off sharply.
 */
export function removePlainBackground(rgba: Uint8ClampedArray, width: number, height: number): BackgroundResult {
  const at = (x: number, y: number) => (y * width + x) * 4

  for (let x = 0; x < width; x++) {
    if (rgba[at(x, 0) + 3] < 250 || rgba[at(x, height - 1) + 3] < 250) return 'alreadyTransparent'
  }
  for (let y = 0; y < height; y++) {
    if (rgba[at(0, y) + 3] < 250 || rgba[at(width - 1, y) + 3] < 250) return 'alreadyTransparent'
  }

  const corners = [at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)]
  const bg = [0, 1, 2].map((c) => Math.round(corners.reduce((sum, i) => sum + rgba[i + c], 0) / 4))
  const dist = (i: number) => Math.hypot(rgba[i] - bg[0], rgba[i + 1] - bg[1], rgba[i + 2] - bg[2])
  if (corners.some((i) => dist(i) > BG_HARD)) return 'noPlainBackground'

  const seen = new Uint8Array(width * height)
  const stack: number[] = []
  const push = (x: number, y: number) => {
    const p = y * width + x
    if (seen[p]) return
    seen[p] = 1
    stack.push(p)
  }
  for (let x = 0; x < width; x++) {
    push(x, 0)
    push(x, height - 1)
  }
  for (let y = 0; y < height; y++) {
    push(0, y)
    push(width - 1, y)
  }

  let cleared = 0
  while (stack.length > 0) {
    const p = stack.pop()!
    const i = p * 4
    const d = dist(i)
    if (d >= BG_SOFT) continue
    if (d <= BG_HARD) {
      rgba[i + 3] = 0
      cleared++
    } else {
      // An edge pixel: partly background. Fade it, but don't spread past it.
      rgba[i + 3] = Math.round(rgba[i + 3] * ((d - BG_HARD) / (BG_SOFT - BG_HARD)))
      continue
    }
    const x = p % width
    const y = (p - x) / width
    if (x > 0) push(x - 1, y)
    if (x < width - 1) push(x + 1, y)
    if (y > 0) push(x, y - 1)
    if (y < height - 1) push(x, y + 1)
  }

  // Nothing left, or nothing removed: there was no shape on a plain background.
  if (cleared === 0 || cleared === width * height) return 'noPlainBackground'
  return 'removed'
}

/** Turns every pixel black and keeps only its transparency: the silhouette the app tints. */
export function toSilhouette(rgba: Uint8ClampedArray): void {
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 0
    rgba[i + 1] = 0
    rgba[i + 2] = 0
  }
}

/** Share of pixels that are mostly opaque — 0 means the result is empty. */
export function opaqueShare(rgba: Uint8ClampedArray): number {
  let opaque = 0
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] >= 128) opaque++
  return opaque / (rgba.length / 4)
}

export const ICON_PREPARE_PROBLEM_TEXT: Record<IconFileProblem | 'unreadable' | 'noPlainBackground' | 'empty', string> = {
  ...ICON_FILE_PROBLEM_TEXT,
  unreadable: 'This file couldn’t be opened. Try exporting it again as PNG or SVG.',
  noPlainBackground:
    'We couldn’t find a plain background to remove. Use an image with a transparent or single-colour background.',
  empty: 'Nothing was left after removing the background. Try an image with a darker or bolder shape.',
}
