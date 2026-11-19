import { useCallback, useRef, type ReactNode } from 'react'
import { Loader2, Mic, Square } from 'lucide-react'
import { DICTATION_DISCLOSURE, formatElapsed, type DictationStatus } from '@/domain/dictation'
import { useDictationField } from '@/components/ui/useDictationField'
import type { TextFieldElement } from '@/components/ui/insertIntoField'
import { cn } from '@/lumen/lib/utils'
import { Button } from './button'
import { Sheet } from './sheet'

/**
 * The Lumen skin of the mic button. All behaviour — recording, transcribing,
 * inserting at the cursor, Escape, the one-time notice — comes from the same
 * `useDictationField` hook the classic button uses; only the look differs.
 */
export function DictationButtonView({
  status,
  elapsedMs,
  errorMessage,
  onPress,
  onDismissError,
  className,
}: {
  status: DictationStatus
  elapsedMs: number
  errorMessage: string | null
  onPress: () => void
  onDismissError: () => void
  className?: string
}) {
  const recording = status === 'recording'
  const transcribing = status === 'transcribing'
  const label = recording ? 'Stop dictation' : transcribing ? 'Transcribing…' : 'Dictate'
  return (
    <div className={cn('relative flex items-center gap-1.5', className)}>
      {recording && <span className="text-xs tabular text-accent-ink">{formatElapsed(elapsedMs)}</span>}
      {errorMessage && (
        <button
          type="button"
          role="alert"
          onClick={onDismissError}
          className="absolute bottom-full right-0 mb-1.5 w-max max-w-[260px] rounded-control border border-line/10 bg-surface-3 px-3 py-2 text-left text-xs text-ink shadow-raised"
        >
          {errorMessage}
        </button>
      )}
      <button
        type="button"
        onClick={onPress}
        disabled={transcribing}
        aria-label={label}
        aria-pressed={recording}
        aria-busy={transcribing}
        title={label}
        className={cn(
          'relative grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors disabled:pointer-events-none disabled:opacity-60 md:h-9 md:w-9',
          recording ? 'bg-accent text-white' : 'text-ink-faint hover:bg-white/[0.06] hover:text-ink',
        )}
      >
        {recording && <span aria-hidden className="absolute inset-0 rounded-full bg-accent/50 motion-safe:animate-ping" />}
        {transcribing ? (
          <Loader2 aria-hidden className="relative h-4 w-4 animate-spin" />
        ) : recording ? (
          <Square aria-hidden className="relative h-3 w-3 fill-current" />
        ) : (
          <Mic aria-hidden className="relative h-4 w-4" />
        )}
      </button>
    </div>
  )
}

function DictationButton({
  getTarget,
  vocabularyHint,
  disabled,
  className,
}: {
  getTarget: () => TextFieldElement | null
  vocabularyHint?: string
  disabled?: boolean
  className?: string
}) {
  const field = useDictationField({ getTarget, vocabularyHint, disabled })
  if (!field.visible) return null
  return (
    <>
      <DictationButtonView
        status={field.status}
        elapsedMs={field.elapsedMs}
        errorMessage={field.errorMessage}
        onPress={field.onPress}
        onDismissError={field.dismissError}
        className={className}
      />
      <Sheet
        open={field.disclosure.open}
        onOpenChange={(open) => !open && field.disclosure.decline()}
        title={DICTATION_DISCLOSURE.title}
        description={DICTATION_DISCLOSURE.description}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={field.disclosure.decline}>
              Not now
            </Button>
            <Button variant="primary" onClick={field.disclosure.accept}>
              {DICTATION_DISCLOSURE.confirmLabel}
            </Button>
          </div>
        }
      >
        <span className="sr-only">Dictation privacy notice</span>
      </Sheet>
    </>
  )
}

/** Wraps one Lumen text field with a mic in its bottom-right corner. Give the field `pr-14`. */
export function DictationField({
  children,
  vocabularyHint,
  disabled,
  className,
}: {
  children: ReactNode
  vocabularyHint?: string
  disabled?: boolean
  className?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const getTarget = useCallback(() => box.current?.querySelector<TextFieldElement>('textarea, input') ?? null, [])
  return (
    <div ref={box} className={cn('relative flex flex-col', className)}>
      {children}
      <DictationButton getTarget={getTarget} vocabularyHint={vocabularyHint} disabled={disabled} className="absolute bottom-1 right-1" />
    </div>
  )
}
