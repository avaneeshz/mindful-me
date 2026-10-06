import {
  checkIconDimensions,
  checkIconFile,
  ICON_UPLOAD_RULES,
  opaqueShare,
  removePlainBackground,
  toSilhouette,
  type BackgroundResult,
  type IconFileProblem,
} from '@/domain/customIcons'

/**
 * Browser adapter for uploaded icons: decodes the file, draws it onto a
 * canvas and runs the pure rules in `domain/customIcons.ts`. The only file
 * that touches `FileReader`, `Image` or `<canvas>` for icons.
 */

export type PreparedIcon =
  | {
      ok: true
      /** The upload as drawn, for the "before" preview. */
      originalUrl: string
      /** The silhouette the app will store and show. */
      resultUrl: string
      background: BackgroundResult
    }
  | { ok: false; problem: IconFileProblem | 'unreadable' | 'noPlainBackground' | 'empty' }

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('decode failed'))
    img.src = src
  })
}

export async function prepareIcon(file: File): Promise<PreparedIcon> {
  const fileProblem = checkIconFile(file)
  if (fileProblem) return { ok: false, problem: fileProblem }

  let img: HTMLImageElement
  try {
    img = await loadImage(await readAsDataUrl(file))
  } catch {
    return { ok: false, problem: 'unreadable' }
  }

  const isVector = file.type === 'image/svg+xml'
  // An SVG without width/height reports 0; fall back to a square canvas.
  const width = img.naturalWidth || (isVector ? ICON_UPLOAD_RULES.outputPixels : 0)
  const height = img.naturalHeight || (isVector ? ICON_UPLOAD_RULES.outputPixels : 0)
  const dimensionProblem = checkIconDimensions(width, height, isVector)
  if (dimensionProblem) return { ok: false, problem: dimensionProblem }

  const size = ICON_UPLOAD_RULES.outputPixels
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return { ok: false, problem: 'unreadable' }
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, size, size)
  const originalUrl = canvas.toDataURL('image/png')

  const pixels = ctx.getImageData(0, 0, size, size)
  const background = removePlainBackground(pixels.data, size, size)
  if (background === 'noPlainBackground') return { ok: false, problem: 'noPlainBackground' }
  toSilhouette(pixels.data)
  if (opaqueShare(pixels.data) < 0.01) return { ok: false, problem: 'empty' }

  ctx.clearRect(0, 0, size, size)
  ctx.putImageData(pixels, 0, 0)
  return { ok: true, originalUrl, resultUrl: canvas.toDataURL('image/png'), background }
}
