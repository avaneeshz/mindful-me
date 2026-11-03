/**
 * State Tile pictures — the frame and the crop maths, as pure functions. The
 * browser parts (reading the file, drawing to a canvas) live in
 * `lib/cardImage.ts`; the backend enforces the size limit in
 * `set_reflection_card_image`.
 */

/** Every tile picture is this shape: the same 4:3 frame the built-in cards use. */
export const CARD_IMAGE = {
  ratio: 4 / 3,
  outputWidth: 640,
  outputHeight: 480,
  maxZoom: 4,
  maxFileBytes: 10 * 1024 * 1024,
  types: ['image/jpeg', 'image/png', 'image/webp'] as const,
}

export type CardImageFileProblem = 'type' | 'size'

export function checkCardImageFile(file: { type: string; size: number }): CardImageFileProblem | null {
  if (!(CARD_IMAGE.types as readonly string[]).includes(file.type)) return 'type'
  if (file.size > CARD_IMAGE.maxFileBytes) return 'size'
  return null
}

export interface CropView {
  /** 1 = the picture just covers the frame; larger zooms in. */
  zoom: number
  /** Pan from centred, as a fraction of the visible range (-1 … 1). */
  panX: number
  panY: number
}

export const INITIAL_CROP: CropView = { zoom: 1, panX: 0, panY: 0 }

export function clampCrop(view: CropView): CropView {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
  return {
    zoom: clamp(view.zoom, 1, CARD_IMAGE.maxZoom),
    panX: clamp(view.panX, -1, 1),
    panY: clamp(view.panY, -1, 1),
  }
}

/**
 * The part of the source picture (in its own pixels) that sits inside the
 * frame for a given view. At zoom 1 the picture covers the frame ("cover"),
 * so there is never an empty edge.
 */
export function sourceRect(imageWidth: number, imageHeight: number, view: CropView) {
  const { zoom, panX, panY } = clampCrop(view)
  const imageRatio = imageWidth / imageHeight
  const baseW = imageRatio > CARD_IMAGE.ratio ? imageHeight * CARD_IMAGE.ratio : imageWidth
  const baseH = baseW / CARD_IMAGE.ratio
  const w = baseW / zoom
  const h = baseH / zoom
  const slackX = imageWidth - w
  const slackY = imageHeight - h
  return {
    x: slackX / 2 + (slackX / 2) * panX,
    y: slackY / 2 + (slackY / 2) * panY,
    w,
    h,
  }
}
