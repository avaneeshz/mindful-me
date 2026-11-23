import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FRAME_NAME_MAX } from '@/domain/frameNames'

export interface FrameSwitcherProps {
  /** The frame currently shown, 1-based. */
  frame: number
  /** How many frames exist. Both arrows rest disabled while this is 1. */
  frameCount: number
  /** What to call the frame; defaults to "Frame N". */
  name?: string
  /** Called with whatever the user typed (empty means "use the default name"). Without it the name is not editable. */
  onRename?: (name: string) => void
  onPrevious?: () => void
  onNext?: () => void
  className?: string
}

const arrowButton = cn(
  'flex size-header items-center justify-center rounded-full text-ink transition-colors',
  'hover:bg-surface-2 active:bg-line focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
  'disabled:cursor-not-allowed disabled:text-ink-dim disabled:opacity-40 disabled:hover:bg-transparent',
)

const labelClass = 'min-w-[64px] max-w-[160px] truncate text-center text-body font-semibold text-ink'

/**
 * "‹ Frame 1 ›" — the header's frame switcher, sitting between the app name and
 * the day controls. Both arrows are real buttons (a tap does the same as a click),
 * and an arrow with nowhere to go is disabled rather than hidden so the control
 * keeps its width and position. The name is a button: tap it to rename the frame
 * (Enter saves, Escape cancels, an empty name restores "Frame N").
 */
export function FrameSwitcher({ frame, frameCount, name, onRename, onPrevious, onNext, className }: FrameSwitcherProps) {
  const label = name ?? `Frame ${frame}`
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  function startEditing() {
    setDraft(name ?? '')
    setEditing(true)
  }

  function commit() {
    if (!editing) return
    setEditing(false)
    if (draft.trim() !== (name ?? '')) onRename?.(draft)
  }

  return (
    <div className={cn('flex items-center gap-xs', className)}>
      <button
        type="button"
        aria-label="Previous frame"
        disabled={frame <= 1 || !onPrevious}
        onClick={onPrevious}
        className={arrowButton}
      >
        <ChevronLeft aria-hidden="true" className="size-[18px]" />
      </button>
      {editing ? (
        <input
          ref={inputRef}
          aria-label={`Name for frame ${frame}`}
          value={draft}
          maxLength={FRAME_NAME_MAX}
          placeholder={`Frame ${frame}`}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit()
            if (event.key === 'Escape') setEditing(false)
          }}
          className="h-header w-[140px] rounded-md border border-line bg-surface-2 px-sm text-center text-body font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
        />
      ) : onRename ? (
        <button
          type="button"
          aria-label={`${label} — rename`}
          title="Rename this frame"
          onClick={startEditing}
          className={cn(labelClass, 'rounded-sm hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink')}
        >
          {label}
        </button>
      ) : (
        <span aria-live="polite" className={labelClass}>
          {label}
        </span>
      )}
      <button
        type="button"
        aria-label="Next frame"
        disabled={frame >= frameCount || !onNext}
        onClick={onNext}
        className={arrowButton}
      >
        <ChevronRight aria-hidden="true" className="size-[18px]" />
      </button>
    </div>
  )
}
