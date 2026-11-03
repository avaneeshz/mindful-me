import { CARD_IMAGE, checkCardImageFile, sourceRect, type CardImageFileProblem, type CropView } from '@/domain/reflectionCardImages'

/**
 * Browser adapter for State Tile pictures: decodes the chosen file and draws
 * the cropped frame to a canvas. The only file that touches `FileReader`,
 * `Image` or `<canvas>` for these pictures.
 */

export type LoadedCardImage =
  | { ok: true; url: string; width: number; height: number }
  | { ok: false; problem: CardImageFileProblem | 'unreadable' }

export async function loadCardImage(file: File): Promise<LoadedCardImage> {
  const problem = checkCardImageFile(file)
  if (problem) return { ok: false, problem }
  try {
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
    const img = await decode(url)
    if (!img.naturalWidth || !img.naturalHeight) return { ok: false, problem: 'unreadable' }
    return { ok: true, url, width: img.naturalWidth, height: img.naturalHeight }
  } catch {
    return { ok: false, problem: 'unreadable' }
  }
}

function decode(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('decode failed'))
    img.src = src
  })
}

/** The framed part of the picture as a 640x480 JPEG data URL, or `null` if the browser can't draw it. */
export async function cropCardImage(url: string, view: CropView): Promise<string | null> {
  try {
    const img = await decode(url)
    const canvas = document.createElement('canvas')
    canvas.width = CARD_IMAGE.outputWidth
    canvas.height = CARD_IMAGE.outputHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const r = sourceRect(img.naturalWidth, img.naturalHeight, view)
    ctx.fillStyle = '#ffffff' // JPEG has no transparency
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.85)
  } catch {
    return null
  }
}
