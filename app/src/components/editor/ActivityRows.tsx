import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, Pencil, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fieldClass } from '@/components/ui/formField'
import { type ActivityRow } from '@/domain/pickerHierarchy'
import { cn } from '@/lib/utils'

export function RowIconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-[32px] shrink-0 items-center justify-center rounded-md text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  )
}

/**
 * Editable sibling list shared by a tile's activities and an activity's
 * subtypes — same rows, same controls, one component. Reorder is up/down
 * buttons (the tap equivalent any drag would need); the pencil opens that
 * row's own editor.
 */
export function EditableActivityList({
  rows,
  subtitle,
  emptyText,
  onOpen,
  onMove,
  onHide,
}: {
  rows: ActivityRow[]
  subtitle?: (row: ActivityRow) => string
  emptyText: string
  onOpen: (id: string) => void
  onMove: (id: string, direction: -1 | 1) => void
  onHide: (id: string) => void
}) {
  if (rows.length === 0) return <p className="text-caption text-ink-dim">{emptyText}</p>
  return (
    <ul className="flex flex-col gap-xs">
      {rows.map((row, index) => {
        const sub = subtitle?.(row)
        return (
          <li key={row.id} className="flex items-center gap-xs rounded-md border border-line-soft bg-bg py-xs pl-md pr-xs">
            <button type="button" onClick={() => onOpen(row.id)} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-body font-semibold text-ink">{row.name}</span>
              {sub ? <span className="block truncate text-caption text-ink-dim">{sub}</span> : null}
            </button>
            <RowIconButton label={`Edit ${row.name}`} onClick={() => onOpen(row.id)}>
              <Pencil aria-hidden="true" className="size-[14px]" />
            </RowIconButton>
            <RowIconButton label={`Move ${row.name} up`} disabled={index === 0} onClick={() => onMove(row.id, -1)}>
              <ChevronUp aria-hidden="true" className="size-[14px]" />
            </RowIconButton>
            <RowIconButton label={`Move ${row.name} down`} disabled={index === rows.length - 1} onClick={() => onMove(row.id, 1)}>
              <ChevronDown aria-hidden="true" className="size-[14px]" />
            </RowIconButton>
            <RowIconButton label={`Hide ${row.name}`} onClick={() => onHide(row.id)}>
              <X aria-hidden="true" className="size-[14px]" />
            </RowIconButton>
          </li>
        )
      })}
    </ul>
  )
}


/** One-line "add" field. `validate` returns an error message to keep the text in place, or null to accept. */
export function AddNameRow({
  label,
  placeholder,
  validate,
  onAdd,
}: {
  label: string
  placeholder: string
  validate: (name: string) => string | null
  onAdd: (name: string) => void
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="flex flex-col gap-xs"
      onSubmit={(e) => {
        e.preventDefault()
        const trimmed = name.trim()
        if (trimmed === '') return
        const problem = validate(trimmed)
        if (problem) {
          setError(problem)
          return
        }
        setError(null)
        onAdd(trimmed)
        setName('')
      }}
    >
      <div className="flex items-center gap-sm">
        <input
          className={cn(fieldClass, 'py-xs')}
          value={name}
          placeholder={placeholder}
          aria-label={label}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
        />
        <Button type="submit" size="inline" className="px-md" disabled={name.trim() === ''}>
          Add
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-caption text-ink-dim">
          {error}
        </p>
      )}
    </form>
  )
}
