import { useRef, useState } from 'react'
import { ImagePlus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fieldClass } from '@/components/ui/formField'
import { CardImageCropper } from '@/components/editor/CardImageCropper'
import { MAX_CARD_NAME_LENGTH, validateCardName } from '@/domain/reflectionCardNames'
import { CARD_IMAGE, INITIAL_CROP, type CardImageFileProblem } from '@/domain/reflectionCardImages'
import { cropCardImage, loadCardImage } from '@/lib/cardImage'
import { useReflectionCards } from '@/state/useReflectionCards'
import { cn } from '@/lib/utils'

const PROBLEMS: Record<CardImageFileProblem | 'unreadable', string> = {
  type: 'Choose a JPG, PNG or WebP picture.',
  size: 'That picture is over 10 MB. Choose a smaller one.',
  unreadable: 'That file couldn’t be opened as a picture.',
}

interface Chosen {
  url: string
  width: number
  height: number
}

/**
 * The editor for one State Tile: its name and its picture. Two steps — the
 * overview (name field, picture, resets) and, after choosing a file, the
 * framing step where the picture is fitted to the tile's 4:3 frame before
 * anything is saved.
 */
export function CardEditPanel({ card, onClose }: { card: number; onClose: () => void }) {
  const { nameFor, imageFor, hasCustomName, hasCustomImage, rename, setImage } = useReflectionCards()
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(nameFor(card))
  const [chosen, setChosen] = useState<Chosen | null>(null)
  const [view, setView] = useState(INITIAL_CROP)
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

  async function onFile(file: File | undefined) {
    if (!file) return
    setError(null)
    const loaded = await loadCardImage(file)
    if (!loaded.ok) {
      setError(PROBLEMS[loaded.problem])
      return
    }
    setView(INITIAL_CROP)
    setChosen(loaded)
  }

  if (chosen) {
    return (
      <div className="flex flex-col gap-md">
        <p className="text-caption font-semibold text-ink">Fit your picture</p>
        <CardImageCropper url={chosen.url} width={chosen.width} height={chosen.height} view={view} onChange={setView} />
        <p className="text-caption text-ink-dim">Drag to move, zoom to resize. The frame is how it will look on the tile.</p>
        {error && (
          <p role="alert" className="text-caption text-ink">
            {error}
          </p>
        )}
        <div className="flex items-center gap-sm">
          <Button
            type="button"
            size="inline"
            disabled={busy}
            onClick={() =>
              void run(
                async () => {
                  const data = await cropCardImage(chosen.url, view)
                  if (!data) return { ok: false, message: 'This picture couldn’t be prepared. Try a different one.' }
                  return setImage(card, data)
                },
                () => setChosen(null),
              )
            }
          >
            {busy ? <Loader2 aria-hidden="true" className="size-[14px] animate-spin" /> : null}
            Use picture
          </Button>
          <Button type="button" variant="ghost" size="inline" disabled={busy} onClick={() => setChosen(null)}>
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
          void onFile(e.target.files?.[0])
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
      {hasCustomImage(card) && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => setImage(card, null), () => undefined)}
          className="self-start text-caption font-medium text-ink-dim underline-offset-2 hover:text-ink hover:underline disabled:opacity-40"
        >
          Use the original picture
        </button>
      )}

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
        {error && (
          <p role="alert" className="text-caption text-ink">
            {error}
          </p>
        )}
        <div className="mt-xs flex items-center gap-sm">
          <Button type="submit" size="inline" disabled={busy || nameProblem !== null}>
            Save
          </Button>
          <Button type="button" variant="ghost" size="inline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          {hasCustomName(card) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => rename(card, ''), onClose)}
              className="ml-auto text-caption font-medium text-ink-dim underline-offset-2 hover:text-ink hover:underline disabled:opacity-40"
            >
              Use original name
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
