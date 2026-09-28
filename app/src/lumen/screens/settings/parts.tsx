import { ChevronLeft, ChevronRight, Loader2, MoreHorizontal, Plus, RotateCcw, X, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { ParameterType } from '@/api/parameterOptions'
import { ICON_CHOICES } from '@/lib/iconRegistry'
import type { UseParameterOptionsResult } from '@/state/useParameterOptions'
import { useParameterSectionEditor } from '@/state/useParameterSectionEditor'
import { Button } from '@/lumen/components/ui/button'
import { Popover } from '@/lumen/components/ui/primitives'
import { Sheet } from '@/lumen/components/ui/sheet'
import { PALETTE, type PaletteColor } from '@/lumen/lib/palette'
import { cn } from '@/lumen/lib/utils'

/* ——— Page frame for a Settings sub-page ——— */

export function SettingsPage({
  eyebrow,
  title,
  onBack,
  backLabel = 'Back',
  action,
  children,
}: {
  eyebrow: string
  title: string
  onBack: () => void
  backLabel?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6">
      <header className="flex items-end gap-2">
        <Button variant="ghost" size="icon" className="-ml-3 mb-0.5" aria-label={backLabel} onClick={onBack}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink-muted">{eyebrow}</p>
          <h1 className="mt-1 truncate font-display text-3xl text-ink md:text-4xl">{title}</h1>
        </div>
        {action}
      </header>
      {children}
    </div>
  )
}

export function Group({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section>
      {(title || action) && (
        <div className="mb-2 flex min-h-8 items-center justify-between px-1">
          {title && <h2 className="text-xs font-medium uppercase tracking-[0.08em] text-ink-faint">{title}</h2>}
          {action}
        </div>
      )}
      <div className="surface divide-y divide-line/[0.06] overflow-hidden rounded-card">{children}</div>
    </section>
  )
}

/** One editable row: tap to open, with a "more" menu for its actions. */
export function EditRow({
  lead,
  label,
  hint,
  onOpen,
  menu,
  muted,
}: {
  lead?: ReactNode
  label: string
  hint?: string
  onOpen?: () => void
  menu?: (close: () => void) => ReactNode
  muted?: boolean
}) {
  const body = (
    <>
      {lead}
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-[15px]', muted ? 'text-ink-muted' : 'text-ink')}>{label}</span>
        {hint && <span className="block truncate text-xs text-ink-faint">{hint}</span>}
      </span>
      {onOpen && <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />}
    </>
  )
  return (
    <div className="flex min-h-14 items-center">
      {onOpen ? (
        <button type="button" onClick={onOpen} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-white/[0.03]">
          {body}
        </button>
      ) : (
        <div className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 py-2">{body}</div>
      )}
      {menu && (
        <Popover
          align="end"
          className="w-56"
          trigger={
            <Button variant="ghost" size="icon" className="mr-1" aria-label={`Actions for ${label}`}>
              <MoreHorizontal className="h-5 w-5" />
            </Button>
          }
        >
          {(close) => menu(close)}
        </Popover>
      )}
    </div>
  )
}

export function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-14 w-full items-center gap-3 px-4 text-left text-[15px] text-accent-ink transition-colors hover:bg-white/[0.03]">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-accent/15">
        <Plus className="h-[18px] w-[18px]" />
      </span>
      {label}
    </button>
  )
}

export function Notice({ children }: { children: ReactNode }) {
  return <p className="rounded-tile border border-line/[0.07] bg-white/[0.02] px-4 py-3 text-sm text-ink-muted">{children}</p>
}

/* ——— Forms ——— */

export const inputClass =
  'h-11 w-full rounded-control border border-line/[0.09] bg-surface-2/60 px-3.5 text-[15px] text-ink placeholder:text-ink-faint focus-visible:border-accent-ink/60'
export const textareaClass =
  'w-full resize-y rounded-control border border-line/[0.09] bg-surface-2/60 px-3.5 py-3 text-[15px] text-ink placeholder:text-ink-faint focus-visible:border-accent-ink/60'

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-ink-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-ink-faint">{hint}</span>}
    </label>
  )
}

/** A name, and optionally an icon — adding or renaming a tile or an activity. */
export function NameSheet({
  open,
  title,
  initialName = '',
  initialIcon,
  withIcon,
  saveLabel = 'Save',
  onSave,
  onClose,
}: {
  open: boolean
  title: string
  initialName?: string
  initialIcon?: string
  withIcon?: boolean
  saveLabel?: string
  onSave: (name: string, iconKey: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState(initialName)
  const [icon, setIcon] = useState(initialIcon ?? ICON_CHOICES[0].key)
  const [lastOpen, setLastOpen] = useState(false)
  // Fresh values each time the sheet opens.
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      setName(initialName)
      setIcon(initialIcon ?? ICON_CHOICES[0].key)
    }
  }
  const valid = name.trim() !== ''
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={title}
      footer={
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          disabled={!valid}
          onClick={() => {
            onSave(name.trim(), icon)
            onClose()
          }}
        >
          {saveLabel}
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Name">
          <input
            autoFocus
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && valid) {
                onSave(name.trim(), icon)
                onClose()
              }
            }}
          />
        </Field>
        {withIcon && (
          <div>
            <p className="mb-2 text-xs font-medium text-ink-muted">Icon</p>
            <div role="radiogroup" aria-label="Icon" className="grid grid-cols-8 gap-1.5 sm:grid-cols-10">
              {ICON_CHOICES.map(({ key, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={icon === key}
                  aria-label={key}
                  title={key}
                  onClick={() => setIcon(key)}
                  className={cn(
                    'grid aspect-square place-items-center rounded-control border transition-colors',
                    icon === key ? 'border-accent-ink/60 bg-accent/[0.14] text-ink' : 'border-line/[0.07] text-ink-muted hover:text-ink',
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  )
}

/** The Soft pastel palette, grouped by tone. */
export function ColorSheet({
  open,
  title,
  value,
  onPick,
  onClose,
}: {
  open: boolean
  title: string
  value: string
  onPick: (id: string) => void
  onClose: () => void
}) {
  const groups: { label: string; colors: PaletteColor[] }[] = [
    { label: 'Pastel', colors: PALETTE.filter((c) => c.tone === 'pastel') },
    { label: 'Deep pastel', colors: PALETTE.filter((c) => c.tone === 'deep') },
    { label: 'Neutral', colors: PALETTE.filter((c) => c.tone === 'neutral') },
  ]
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title={title} description="Shows on the strips, tiles and charts.">
      <div className="flex flex-col gap-5">
        {groups.map((g) => (
          <div key={g.label}>
            <p className="mb-2 text-xs font-medium text-ink-muted">{g.label}</p>
            <div role="radiogroup" aria-label={g.label} className="grid grid-cols-8 gap-2">
              {g.colors.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={value === c.id}
                  aria-label={c.name}
                  title={c.name}
                  onClick={() => {
                    onPick(c.id)
                    onClose()
                  }}
                  className={cn(
                    'aspect-square rounded-full transition-transform duration-150 hover:scale-105',
                    value === c.id && 'ring-2 ring-accent-ink ring-offset-2 ring-offset-surface-1',
                  )}
                  style={{ backgroundColor: c.shades.base }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  )
}

export function ConfirmSheet({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  body: string
  confirmLabel: string
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={title}
      footer={
        <div className="flex gap-2">
          <Button className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="flex-1 border-danger/40 text-danger hover:bg-danger/10"
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-ink-muted">{body}</p>
    </Sheet>
  )
}

/* ——— One option list (quality / symptoms / protective response) ——— */

export const OPTION_SECTIONS: { type: ParameterType; label: string; helper: string }[] = [
  { type: 'quality', label: 'Activity quality', helper: 'How this activity felt when logged.' },
  { type: 'symptom', label: 'Chronic symptoms', helper: 'Symptoms noticed around this activity.' },
  { type: 'flag', label: 'Protective response', helper: 'At most one per entry.' },
]

/**
 * Lumen's view of one option list — the behaviour (never emptying a list,
 * keeping options with logged history, one write at a time) is Classic's
 * own, shared through `useParameterSectionEditor`.
 */
export function OptionSection({
  section,
  activityName,
  data,
}: {
  section: (typeof OPTION_SECTIONS)[number]
  activityName: string | null
  data: UseParameterOptionsResult
}) {
  const editor = useParameterSectionEditor(section, activityName, data)
  const [draft, setDraft] = useState('')
  const status = activityName === null ? 'Default for every activity' : editor.overridden ? 'Customized here' : 'Inherited'

  return (
    <div className="surface flex flex-col gap-3 rounded-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-medium text-ink">{section.label}</h3>
          <p className="text-xs text-ink-faint">{section.helper}</p>
        </div>
        <span className="shrink-0 rounded-full bg-white/[0.05] px-2.5 py-1 text-xs text-ink-muted">{status}</span>
      </div>

      {data.status === 'ready' && editor.effective.length === 0 && <p className="text-sm text-ink-faint">No options yet.</p>}
      <ul className="flex flex-wrap gap-2" aria-label={`${section.label} options`}>
        {editor.effective.map((option) => (
          <li
            key={option.label}
            className="flex h-9 items-center gap-1 rounded-full border border-line/[0.09] bg-white/[0.02] pl-3.5 pr-1 text-sm text-ink"
          >
            {option.label}
            <button
              type="button"
              aria-label={`Remove ${option.label}`}
              disabled={editor.busy}
              onClick={() => void editor.remove(option.label)}
              className="grid h-7 w-7 place-items-center rounded-full text-ink-faint transition-colors hover:bg-white/[0.06] hover:text-ink disabled:opacity-40"
            >
              {editor.removingLabel === option.label ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
            </button>
          </li>
        ))}
      </ul>

      {editor.rowError && (
        <p role="alert" className="text-sm text-danger">
          {editor.rowError}
        </p>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const label = draft.trim()
          if (!label || editor.busy) return
          void editor.add(label).then((ok) => ok && setDraft(''))
        }}
      >
        <input
          className={cn(inputClass, 'h-10')}
          placeholder="Add an option"
          aria-label={`Add a ${section.label.toLowerCase()} option`}
          value={draft}
          disabled={editor.busy}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button type="submit" className="h-10" disabled={!draft.trim() || editor.busy}>
          {editor.pendingAction === 'add' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
        </Button>
      </form>

      {activityName !== null && editor.overridden && (
        <Button variant="ghost" className="-ml-2 h-9 self-start px-2 text-ink-muted" disabled={editor.busy} onClick={() => void editor.reset()}>
          {editor.pendingAction === 'reset' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          Reset to inherited
        </Button>
      )}
    </div>
  )
}

export function SmallIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.05] text-ink-muted">
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
    </span>
  )
}
