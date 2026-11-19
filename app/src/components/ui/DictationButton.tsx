import { useCallback, useRef, type ReactNode } from 'react'
import { Loader2, Mic, Square } from 'lucide-react'
import { DICTATION_DISCLOSURE, formatElapsed, type DictationStatus } from '@/domain/dictation'
import { ConfirmDialog } from './ConfirmDialog'
import { cn } from '@/lib/utils'
import { useDictationField } from './useDictationField'
import type { TextFieldElement } from './insertIntoField'

export interface DictationButtonViewProps {
  status: DictationStatus
  elapsedMs: number
  errorMessage: string | null
  onPress: () => void
  onDismissError: () => void
  className?: string
}

/**
 * The classic-interface mic button — presentation only. Idle: a quiet mic.
 * Recording: the theme's invert fill with a soft ring, the elapsed time beside
 * it, and a stop square. Transcribing: a spinner (the field stays editable).
 * An error shows as a short message above the button; tapping it dismisses it.
 */
export function DictationButtonView({ status, elapsedMs, errorMessage, onPress, onDismissError, className }: DictationButtonViewProps) {
  const recording = status === 'recording'
  const transcribing = status === 'transcribing'
  const label = recording ? 'Stop dictation' : transcribing ? 'Transcribing…' : 'Dictate'

  return (
    <div className={cn('relative flex items-center gap-xs', className)}>
      {recording && (
        <span className="text-caption tabular-nums text-ink" aria-live="off">
          {formatElapsed(elapsedMs)}
        </span>
      )}
      {errorMessage && (
        <button
          type="button"
          role="alert"
          onClick={onDismissError}
          className="absolute bottom-full right-0 mb-xs w-max max-w-[260px] rounded-sm border border-line bg-surface px-md py-sm text-left text-caption text-ink shadow-sm"
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
          'relative inline-flex h-3xl w-3xl shrink-0 items-center justify-center rounded-full transition-colors mobile:h-control mobile:w-control',
          'disabled:pointer-events-none disabled:opacity-60',
          recording ? 'bg-inv-bg text-inv-ink' : 'text-ink-dim hover:bg-surface-2 hover:text-ink',
        )}
      >
        {recording && (
          <span aria-hidden="true" className="absolute inset-0 rounded-full border border-ink opacity-40 motion-safe:animate-ping" />
        )}
        {transcribing ? (
          <Loader2 aria-hidden="true" className="size-[16px] animate-spin" />
        ) : recording ? (
          <Square aria-hidden="true" className="size-[12px] fill-current" />
        ) : (
          <Mic aria-hidden="true" className="size-[16px]" />
        )}
      </button>
    </div>
  )
}

export interface DictationButtonProps {
  getTarget: () => TextFieldElement | null
  vocabularyHint?: string
  disabled?: boolean
  className?: string
}

/** A mic for one text field. Renders nothing where dictation isn't available. */
export function DictationButton({ getTarget, vocabularyHint, disabled, className }: DictationButtonProps) {
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
      <ConfirmDialog
        portal
        open={field.disclosure.open}
        title={DICTATION_DISCLOSURE.title}
        description={DICTATION_DISCLOSURE.description}
        confirmLabel={DICTATION_DISCLOSURE.confirmLabel}
        onConfirm={field.disclosure.accept}
        onCancel={field.disclosure.decline}
      />
    </>
  )
}

/**
 * Wraps one `<textarea>`/`<input>` and puts a mic in its bottom-right corner.
 * Opt-in per field: wrap the field, and give the field `pr-5xl` so text never
 * runs underneath the button.
 */
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
    <div ref={box} className={cn('relative', className)}>
      {children}
      <DictationButton getTarget={getTarget} vocabularyHint={vocabularyHint} disabled={disabled} className="absolute bottom-xs right-xs" />
    </div>
  )
}
