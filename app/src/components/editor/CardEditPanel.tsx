import { useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ImagePlus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fieldClass } from '@/components/ui/formField'
import { CardImageCropper } from '@/components/editor/CardImageCropper'
import { MAX_CARD_NAME_LENGTH, validateCardName } from '@/domain/reflectionCardNames'
import { CARD_IMAGE } from '@/domain/reflectionCardImages'
import { useCardPicture } from '@/components/editor/useCardPicture'
import { useReflectionCards } from '@/state/useReflectionCards'
import { cn } from '@/lib/utils'

/**
 * The editor for one State Tile: its name and its picture. Two steps — the
 * overview (name field, picture, resets) and, after choosing a file, the
 * framing step where the picture is fitted to the tile's 4:3 frame before
 * anything is saved.
 */
export function CardEditPanel({ card, onClose }: { card: number; onClose: () => void }) {
  const { nameFor, imageFor, rename, setImage, order, moveBy } = useReflectionCards()
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(nameFor(card))
  const { chosen, view, setView, problem, choose, frame, cancel } = useCardPicture()
  const position = order.indexOf(card)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(task: () => Promise<{ ok: true } | { ok: false; message: string }>, done: () => void) {
    setBusy(true)
    setError(null)
    const result = await task()
    setBusy(false)
    if (result.ok) done()
    else setError(result.message)
  }

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
              void run(
                async () => {
                  const data = await frame()
                  if (!data) return { ok: false, message: 'This picture couldn’t be prepared. Try a different one.' }
                  return setImage(card, data)
                },
                cancel,
              )
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

  const nameProblem = validateCardName(name)
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
        aria-label="Change picture"
        className="group relative block w-full overflow-hidden rounded-md border border-line focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        style={{ aspectRatio: String(CARD_IMAGE.ratio) }}
      >
        <img src={imageFor(card)} alt="" className="size-full object-cover" />
        <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-xs bg-black/55 py-xs text-caption font-semibold text-white">
          <ImagePlus aria-hidden="true" className="size-[14px]" />
          Change picture
        </span>
      </button>

      <div className="flex items-center justify-between gap-sm" role="group" aria-label="Position">
        <span className="text-caption font-semibold text-ink">
          Position <span className="font-normal text-ink-dim">{position + 1} of {order.length}</span>
        </span>
        <span className="flex items-center gap-xs">
          <Button
            type="button"
            variant="outline"
            aria-label="Move earlier"
            disabled={busy || position <= 0}
            onClick={() => void run(() => moveBy(card, -1), () => undefined)}
          >
            <ArrowLeft aria-hidden="true" className="size-[14px]" />
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-label="Move later"
            disabled={busy || position === order.length - 1}
            onClick={() => void run(() => moveBy(card, 1), () => undefined)}
          >
            <ArrowRight aria-hidden="true" className="size-[14px]" />
          </Button>
        </span>
      </div>

      <form
        className="flex flex-col gap-xs"
        onSubmit={(e) => {
          e.preventDefault()
          if (nameProblem) return
          void run(() => rename(card, name), onClose)
        }}
      >
        <label className="text-caption font-semibold text-ink" htmlFor={`card-name-${card}`}>
          Name
        </label>
        <input
          id={`card-name-${card}`}
          className={cn(fieldClass, 'py-xs')}
          value={name}
          maxLength={MAX_CARD_NAME_LENGTH + 10}
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
            Save
          </Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
