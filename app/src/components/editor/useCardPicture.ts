import { useState } from 'react'
import { INITIAL_CROP, type CardImageFileProblem, type CropView } from '@/domain/reflectionCardImages'
import { cropCardImage, loadCardImage } from '@/lib/cardImage'

const PROBLEMS: Record<CardImageFileProblem | 'unreadable', string> = {
  type: 'Choose a JPG, PNG or WebP picture.',
  size: 'That picture is over 10 MB. Choose a smaller one.',
  unreadable: 'That file couldn’t be opened as a picture.',
}

export interface ChosenPicture {
  url: string
  width: number
  height: number
}

/**
 * The shared "choose a file, then frame it in the tile's 4:3 shape" flow behind
 * every State Tile picture — used by the tile editor (existing tile) and the
 * Add tile form (new tile). It only holds the choosing/framing state; what to
 * do with the framed JPEG is the caller's.
 */
export function useCardPicture() {
  const [chosen, setChosen] = useState<ChosenPicture | null>(null)
  const [view, setView] = useState<CropView>(INITIAL_CROP)
  const [problem, setProblem] = useState<string | null>(null)

  async function choose(file: File | undefined) {
    if (!file) return
    setProblem(null)
    const loaded = await loadCardImage(file)
    if (!loaded.ok) {
      setProblem(PROBLEMS[loaded.problem])
      return
    }
    setView(INITIAL_CROP)
    setChosen(loaded)
  }

  /** The framed picture as the JPEG data URL that gets saved, or `null` if it couldn't be prepared. */
  async function frame(): Promise<string | null> {
    return chosen ? cropCardImage(chosen.url, view) : null
  }

  function cancel() {
    setChosen(null)
  }

  return { chosen, view, setView, problem, setProblem, choose, frame, cancel }
}
