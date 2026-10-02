import { useEffect, useRef, useState } from 'react'
import { Check, Pipette, RotateCcw } from 'lucide-react'
import { fieldClass } from '@/components/ui/formField'
import { COLOR_PRESETS, PICKER_START_COLOR, normalizeHexColor, readableInkOn } from '@/domain/colors'
import { cn } from '@/lib/utils'

/**
 * A paint-style colour picker: a preset palette to tap, a "Custom" swatch
 * that opens the platform's full-spectrum colour dialog (any colour at all),
 * and a hex field for exact values. Every path is tap/keyboard reachable —
 * nothing relies on drag or hover (portability rule 5).
 *
 * `value` null means "no colour of my own"; `inheritedColor`/`inheritedLabel`
 * describe what shows instead, and "Reset" returns to it.
 */
export function ColorPicker({
  value,
  onChange,
  inheritedColor = null,
  inheritedLabel,
}: {
  value: string | null
  onChange: (color: string | null) => void
  inheritedColor?: string | null
  /** e.g. "Uses Work & Projects’ colour" — shown while `value` is null. */
  inheritedLabel?: string
}) {
  const [hexDraft, setHexDraft] = useState(value ?? '')
  const [hexError, setHexError] = useState(false)
  // The native dialog fires on every pointer move; preview immediately,
  // commit once the user settles so a drag isn't dozens of saves.
  const [livePreview, setLivePreview] = useState<string | null>(null)
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setHexDraft(value ?? '')
    setHexError(false)
  }, [value])

  useEffect(() => () => {
    if (commitTimer.current) clearTimeout(commitTimer.current)
  }, [])

  const shown = livePreview ?? value ?? inheritedColor
  const isCustom = value !== null && !COLOR_PRESETS.includes(value)

  function commitHex() {
    if (hexDraft.trim() === '') {
      if (value !== null) onChange(null)
      setHexError(false)
      return
    }
    const normalized = normalizeHexColor(hexDraft)
    if (!normalized) {
      setHexError(true)
      return
    }
    setHexError(false)
    if (normalized !== value) onChange(normalized)
  }

  return (
    <div className="flex flex-col gap-sm">
      <div className="flex items-center justify-between gap-sm">
        <div className="flex min-w-0 items-center gap-sm">
          <span
            aria-hidden="true"
            className={cn('size-[24px] shrink-0 rounded-full border border-line', !shown && 'bg-surface-2')}
            style={shown ? { background: shown } : undefined}
          />
          <span className="truncate text-caption text-ink-dim">
            {value ? value.toUpperCase() : (inheritedLabel ?? 'Default')}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={value === null}
          className="flex shrink-0 items-center gap-xs rounded-md px-sm py-xs text-caption font-semibold text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink disabled:pointer-events-none disabled:opacity-40"
        >
          <RotateCcw aria-hidden="true" className="size-[12px]" />
          Reset
        </button>
      </div>

      <div role="radiogroup" aria-label="Colour" className="grid grid-cols-10 gap-xs">
        {COLOR_PRESETS.map((preset) => {
          const selected = value === preset
          return (
            <button
              key={preset}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={preset.toUpperCase()}
              title={preset.toUpperCase()}
              onClick={() => onChange(preset)}
              className={cn(
                'flex aspect-square w-full items-center justify-center rounded-sm border border-black/10 transition-transform',
                'hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                selected && 'outline outline-2 outline-offset-1 outline-ink',
              )}
              style={{ background: preset }}
            >
              {selected && <Check aria-hidden="true" className="size-[12px]" style={{ color: readableInkOn(preset) }} strokeWidth={3} />}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-sm">
        {/* The full-spectrum picker: a real <input type="color"> styled as a
            swatch button, so the platform's own colour dialog opens on tap. */}
        <label
          className={cn(
            'relative flex shrink-0 cursor-pointer items-center gap-xs rounded-md border px-sm py-xs text-caption font-semibold text-ink transition-colors hover:border-ink',
            'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink',
            isCustom ? 'border-ink' : 'border-line',
          )}
        >
          <Pipette aria-hidden="true" className="size-[14px]" />
          Custom
          <input
            type="color"
            aria-label="Choose any colour"
            className="absolute inset-0 size-full cursor-pointer opacity-0"
            value={shown ?? PICKER_START_COLOR}
            onChange={(e) => {
              const next = normalizeHexColor(e.target.value)
              if (!next) return
              setLivePreview(next)
              setHexDraft(next)
              if (commitTimer.current) clearTimeout(commitTimer.current)
              commitTimer.current = setTimeout(() => {
                setLivePreview(null)
                onChange(next)
              }, 300)
            }}
          />
        </label>
        <input
          className={cn(fieldClass, 'py-xs text-caption uppercase tabular-nums', hexError && 'border-status-error')}
          placeholder="#RRGGBB"
          aria-label="Hex colour"
          aria-invalid={hexError || undefined}
          value={hexDraft}
          maxLength={7}
          onChange={(e) => {
            setHexDraft(e.target.value)
            setHexError(false)
          }}
          onBlur={commitHex}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitHex()
            }
          }}
        />
      </div>
      {hexError && (
        <p role="alert" className="text-caption text-status-error">
          Enter a hex colour like #3E63DD.
        </p>
      )}
    </div>
  )
}
