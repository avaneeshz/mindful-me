import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface FrameSwitcherProps {
  /** The frame currently shown, 1-based. */
  frame: number
  /** How many frames exist. Both arrows rest disabled while this is 1. */
  frameCount: number
  onPrevious?: () => void
  onNext?: () => void
  className?: string
}

const arrowButton = cn(
  'flex size-header items-center justify-center rounded-full text-ink transition-colors',
  'hover:bg-surface-2 active:bg-line focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
  'disabled:cursor-not-allowed disabled:text-ink-dim disabled:opacity-40 disabled:hover:bg-transparent',
)

/**
 * "‹ Frame 1 ›" — the header's frame switcher, sitting between the app name and
 * the day controls. Both arrows are real buttons (a tap does the same as a click),
 * and an arrow with nowhere to go is disabled rather than hidden so the control
 * keeps its width and position.
 */
export function FrameSwitcher({ frame, frameCount, onPrevious, onNext, className }: FrameSwitcherProps) {
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
      <span aria-live="polite" className="min-w-[64px] text-center text-body font-semibold text-ink">
        Frame {frame}
      </span>
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
