import { useRef, useState } from 'react'
import { ImagePlus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fieldClass } from '@/components/ui/formField'
import { CardImageCropper } from '@/components/editor/CardImageCropper'
import { useCardPicture } from '@/components/editor/useCardPicture'
import { MAX_CARD_NAME_LENGTH, validateCardName } from '@/domain/reflectionCardNames'
import { CARD_IMAGE } from '@/domain/reflectionCardImages'
import { useReflectionCards } from '@/state/useReflectionCards'
import { cn } from '@/lib/utils'

/**
 * Add a State Tile of your own: a name (required) and a picture (optional).
 * Same two steps as editing a tile's picture — the overview, and a framing
 * step that fits the chosen picture to the tile's 4:3 shape — but nothing is
 * saved until Add tile; the new tile then appears last in the grid.
 */
export function NewCardPanel({ onClose, onAdded, groupId }: { onClose: () => void; onAdded?: (card: number) => void; /** The category the new tile goes into; omitted → the first. */ groupId?: string }) {
  const { addCard } = useReflectionCards()
  const fileRef = useRef<HTMLInputElement>(null)
  const { chosen, view, setView, problem, choose, frame, cancel } = useCardPicture()
  const [name, setName] = useState('')
  const [picture, setPicture] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nameProblem = validateCardName(name)

  if (chosen) {
    return (
      <div className="flex flex-col gap-md">
        <p className="text-caption font-semibold text-ink">Fit your picture</p>
        <CardImageCropper url={chosen.url} width={chosen.width} height={chosen.height} view={view} onChange={setView} />
        {error && (
          <p role="alert" className="text-caption text-ink">
            {error}
          </p>
        )}
        <div className="flex items-center gap-sm">
          <Button
            type="button"
            disabled={busy}
            onClick={() =>
              void (async () => {
                setBusy(true)
                setError(null)
                const data = await frame()
                setBusy(false)
                if (!data) {
                  setError('This picture couldn’t be prepared. Try a different one.')
                  return
                }
                setPicture(data)
                cancel()
              })()
            }
          >
            {busy ? <Loader2 aria-hidden="true" className="size-[14px] animate-spin" /> : null}
            Use picture
          </Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={cancel}>
            Back
          </Button>
        </div>
      </div>
    )
  }

  async function submit() {
    if (nameProblem || busy) return
    setBusy(true)
    setError(null)
    const result = await addCard(name, picture, groupId)
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    if (result.card !== undefined) onAdded?.(result.card)
    onClose()
  }

  return (
    <div className="flex flex-col gap-md">
      <input
        ref={fileRef}
        type="file"
        accept={CARD_IMAGE.types.join(',')}
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose a picture"
        onChange={(e) => {
          void choose(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        aria-label={picture ? 'Change picture' : 'Add a picture'}
        className="group relative block w-full overflow-hidden rounded-md border border-dashed border-line bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        style={{ aspectRatio: String(CARD_IMAGE.ratio) }}
      >
        {picture ? (
          <img src={picture} alt="" className="size-full object-cover" />
        ) : (
          <span className="flex size-full flex-col items-center justify-center gap-xs text-caption font-semibold text-ink-dim transition-colors group-hover:text-ink">
            <ImagePlus aria-hidden="true" className="size-[20px]" />
            Add a picture
          </span>
        )}
        {picture && (
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-xs bg-black/55 py-xs text-caption font-semibold text-white">
            <ImagePlus aria-hidden="true" className="size-[14px]" />
            Change picture
          </span>
        )}
      </button>

      <form
        className="flex flex-col gap-xs"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <label className="text-caption font-semibold text-ink" htmlFor="new-card-name">
          Name
        </label>
        <input
          id="new-card-name"
          className={cn(fieldClass, 'py-xs')}
          value={name}
          maxLength={MAX_CARD_NAME_LENGTH + 10}
          placeholder="e.g. Gratitude"
          autoFocus
          onChange={(e) => setName(e.target.value)}
          aria-invalid={nameProblem !== null && name !== ''}
        />
        {name !== '' && nameProblem && <p className="text-caption text-ink-dim">{nameProblem}</p>}
        {(error ?? problem) && (
          <p role="alert" className="text-caption text-ink">
            {error ?? problem}
          </p>
        )}
        <div className="mt-xs flex items-center gap-sm">
          <Button type="submit" disabled={busy || nameProblem !== null}>
            {busy ? <Loader2 aria-hidden="true" className="size-[14px] animate-spin" /> : null}
            Add tile
          </Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
