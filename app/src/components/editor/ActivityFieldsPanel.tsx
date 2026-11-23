import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, ListChecks, Loader2, Pencil, RotateCcw, StickyNote, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AddNameRow, RowIconButton } from '@/components/editor/ActivityRows'
import { InlineNameForm } from '@/components/editor/InlineNameForm'
import {
  fieldsForActivity,
  isFieldLabelTaken,
  isOptionLabelTaken,
  moveId,
  rootActivityId,
  validateFieldLabel,
  type ActivityField,
  type ActivityFieldKind,
  type ActivityFieldOption,
} from '@/domain/activityFields'
import type { ActivityRow } from '@/domain/pickerHierarchy'
import type { UseActivityFieldsResult } from '@/state/useActivityFields'
import { cn } from '@/lib/utils'

const ROW = 'flex items-center gap-xs rounded-md border border-line-soft bg-bg py-xs pl-md pr-xs'

/**
 * One activity's own notes and multiple-select fields: any number of each,
 * each with its own title, and each multiple-select field with its own
 * options. The three fields that always existed (Activity quality, Chronic
 * symptoms, Protective response) are ordinary fields here — rename, reorder,
 * edit their options or hide them like any other.
 *
 * Hiding never erases anything: past entries keep what they recorded, and a
 * hidden note, field or option can be restored. Reordering is up / down
 * buttons — the tap equivalent any drag would need. A subtype has no fields
 * of its own; it points to its parent's.
 */
export function ActivityFieldsPanel({
  activity,
  rows,
  data,
  onOpenActivity,
}: {
  activity: ActivityRow
  rows: readonly ActivityRow[]
  data: UseActivityFieldsResult
  onOpenActivity: (id: string) => void
}) {
  const rootId = rootActivityId(rows, activity.id)
  const root = rows.find((r) => r.id === rootId)
  const [adding, setAdding] = useState<ActivityFieldKind | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [showHidden, setShowHidden] = useState(false)

  if (rootId !== activity.id) {
    return (
      <section aria-label="Notes and fields" className="flex flex-col gap-sm">
        <h4 className="text-caption font-bold uppercase tracking-tag text-ink-dim">Notes &amp; fields</h4>
        <p className="text-caption text-ink-dim">
          &quot;{activity.name}&quot; uses the notes and fields of &quot;{root?.name ?? 'its activity'}&quot;. Change them there.
        </p>
        <Button variant="outline" size="inline" className="self-start px-sm py-xs text-caption" onClick={() => onOpenActivity(rootId)}>
          Open {root?.name ?? 'activity'}
        </Button>
      </section>
    )
  }

  const all = fieldsForActivity(data.fields, rows, activity.id, { includeHidden: true })
  const shown = all.filter((f) => !f.hidden)
  const hidden = all.filter((f) => f.hidden)
  const shownIds = shown.map((f) => f.id)

  function rename(field: ActivityField, label: string) {
    const result = data.renameField(field.id, label)
    if (result.ok) {
      setRenamingId(null)
      setRenameError(null)
    } else {
      setRenameError(result.message)
    }
  }

  return (
    <section aria-label="Notes and fields" className="flex flex-col gap-sm">
      <div className="flex items-center justify-between gap-md">
        <h4 className="text-caption font-bold uppercase tracking-tag text-ink-dim">Notes &amp; fields</h4>
        {data.status === 'loading' && <Loader2 aria-hidden="true" className="size-[16px] animate-spin text-ink-dim" />}
      </div>
      <p className="text-caption text-ink-dim">
        What you can record each time you log &quot;{activity.name}&quot;. Add as many notes and multiple-select fields as you like.
      </p>
      {data.status === 'error' && (
        <p role="alert" className="text-caption text-ink-dim">
          {data.error}
        </p>
      )}

      {shown.length === 0 && data.status === 'ready' && (
        <p className="text-caption text-ink-dim">No notes or fields yet. Add the first one below.</p>
      )}

      <ul className="flex flex-col gap-xs">
        {shown.map((field, index) => (
          <li key={field.id} className="flex flex-col gap-xs">
            {renamingId === field.id ? (
              <InlineNameForm
                initial={field.label}
                error={renameError}
                onSave={(label) => rename(field, label)}
                onCancel={() => {
                  setRenamingId(null)
                  setRenameError(null)
                }}
              />
            ) : (
              <div className={ROW}>
                <FieldIcon kind={field.kind} />
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-body font-semibold text-ink">{field.label}</span>
                  <span className="block truncate text-caption text-ink-dim">{describe(field)}</span>
                </div>
                <RowIconButton label={`Rename ${field.label}`} onClick={() => setRenamingId(field.id)}>
                  <Pencil aria-hidden="true" className="size-[14px]" />
                </RowIconButton>
                {field.kind === 'multiselect' && (
                  <RowIconButton
                    label={openId === field.id ? `Close options for ${field.label}` : `Edit options for ${field.label}`}
                    expanded={openId === field.id}
                    onClick={() => setOpenId(openId === field.id ? null : field.id)}
                  >
                    <ListChecks aria-hidden="true" className="size-[14px]" />
                  </RowIconButton>
                )}
                <RowIconButton
                  label={`Move ${field.label} up`}
                  disabled={index === 0}
                  onClick={() => {
                    const next = moveId(shownIds, field.id, -1)
                    if (next) data.reorderFields(activity.id, next)
                  }}
                >
                  <ChevronUp aria-hidden="true" className="size-[14px]" />
                </RowIconButton>
                <RowIconButton
                  label={`Move ${field.label} down`}
                  disabled={index === shown.length - 1}
                  onClick={() => {
                    const next = moveId(shownIds, field.id, 1)
                    if (next) data.reorderFields(activity.id, next)
                  }}
                >
                  <ChevronDown aria-hidden="true" className="size-[14px]" />
                </RowIconButton>
                <RowIconButton label={`Hide ${field.label}`} onClick={() => data.setFieldHidden(field.id, true)}>
                  <Trash2 aria-hidden="true" className="size-[14px]" />
                </RowIconButton>
              </div>
            )}
            {field.kind === 'multiselect' && openId === field.id && <OptionsEditor field={field} data={data} />}
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="flex flex-col gap-xs">
          <AddNameRow
            key={adding}
            label={adding === 'text' ? 'New note title' : 'New field title'}
            placeholder={adding === 'text' ? 'Note title, e.g. Gratitude' : 'Field title, e.g. Mood'}
            validate={(title) =>
              validateFieldLabel(title, adding === 'text' ? 'note' : 'field') ??
              (isFieldLabelTaken(data.fields, activity.id, title)
                ? `You already have a note or field called “${title}” here. Pick a different title.`
                : null)
            }
            onAdd={(title) => {
              const result = data.addField(activity.id, adding, title)
              if (result.ok && adding === 'multiselect') setOpenId(result.value.id)
              setAdding(null)
            }}
          />
          <Button variant="ghost" size="inline" className="self-start" onClick={() => setAdding(null)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-sm">
          <Button variant="outline" size="inline" className="px-md py-xs text-caption" onClick={() => setAdding('text')}>
            Add note
          </Button>
          <Button variant="outline" size="inline" className="px-md py-xs text-caption" onClick={() => setAdding('multiselect')}>
            Add multiple-select field
          </Button>
        </div>
      )}

      {hidden.length > 0 && (
        <div className="flex flex-col gap-xs">
          <Button
            variant="accent"
            className="self-start"
            aria-expanded={showHidden}
            onClick={() => setShowHidden((v) => !v)}
          >
            {showHidden ? 'Hide' : 'Show'} {hidden.length} hidden {hidden.length === 1 ? 'item' : 'items'}
          </Button>
          {showHidden && (
            <ul className="flex flex-col gap-xs">
              {hidden.map((field) => (
                <li key={field.id} className={cn(ROW, 'opacity-80')}>
                  <FieldIcon kind={field.kind} />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-body text-ink">{field.label}</span>
                    <span className="block truncate text-caption text-ink-dim">Hidden · past entries keep it</span>
                  </div>
                  <RowIconButton label={`Restore ${field.label}`} onClick={() => data.setFieldHidden(field.id, false)}>
                    <RotateCcw aria-hidden="true" className="size-[14px]" />
                  </RowIconButton>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

function describe(field: ActivityField): string {
  if (field.kind === 'text') return 'Note'
  const count = field.options.filter((o) => !o.hidden).length
  return `Multiple select · ${count} ${count === 1 ? 'option' : 'options'}`
}

function FieldIcon({ kind }: { kind: ActivityFieldKind }): ReactNode {
  const Icon = kind === 'text' ? StickyNote : ListChecks
  return (
    <span className="flex size-chip shrink-0 items-center justify-center rounded-sm bg-surface-2 text-ink-dim">
      <Icon aria-hidden="true" className="size-[16px]" />
    </span>
  )
}

/** A multiple-select field's options: add, rename, reorder, hide and restore. */
function OptionsEditor({ field, data }: { field: ActivityField; data: UseActivityFieldsResult }) {
  const ordered = [...field.options].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
  const shown = ordered.filter((o) => !o.hidden)
  const hidden = ordered.filter((o) => o.hidden)
  const shownIds = shown.map((o) => o.id)
  return (
    <div className="flex flex-col gap-xs border-l border-line-soft pl-md" role="group" aria-label={`Options for ${field.label}`}>
      {shown.length === 0 && <p className="text-caption text-ink-dim">No options yet. Add the first one below.</p>}
      <ul className="flex flex-col gap-xs">
        {shown.map((option, index) => (
          <OptionRow
            key={option.id}
            field={field}
            option={option}
            index={index}
            count={shown.length}
            onMove={(direction) => {
              const next = moveId(shownIds, option.id, direction)
              if (next) data.reorderOptions(field.id, next)
            }}
            data={data}
          />
        ))}
      </ul>
      <AddNameRow
        label={`New option for ${field.label}`}
        placeholder="New option"
        validate={(label) =>
          validateFieldLabel(label, 'option') ?? (isOptionLabelTaken(field, label) ? `“${label}” is already an option here.` : null)
        }
        onAdd={(label) => data.addOption(field.id, label)}
      />
      {hidden.length > 0 && (
        <ul className="flex flex-col gap-xs" aria-label="Hidden options">
          {hidden.map((option) => (
            <li key={option.id} className={cn(ROW, 'opacity-80')}>
              <span className="min-w-0 flex-1 truncate text-body text-ink-dim">{option.label} · hidden</span>
              <RowIconButton label={`Restore ${option.label}`} onClick={() => data.setOptionHidden(field.id, option.id, false)}>
                <RotateCcw aria-hidden="true" className="size-[14px]" />
              </RowIconButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function OptionRow({
  field,
  option,
  index,
  count,
  onMove,
  data,
}: {
  field: ActivityField
  option: ActivityFieldOption
  index: number
  count: number
  onMove: (direction: -1 | 1) => void
  data: UseActivityFieldsResult
}) {
  const [renaming, setRenaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (renaming) {
    return (
      <li>
        <InlineNameForm
          initial={option.label}
          error={error}
          onSave={(label) => {
            const result = data.renameOption(field.id, option.id, label)
            if (result.ok) {
              setRenaming(false)
              setError(null)
            } else setError(result.message)
          }}
          onCancel={() => {
            setRenaming(false)
            setError(null)
          }}
        />
      </li>
    )
  }
  return (
    <li className={ROW}>
      <span className="min-w-0 flex-1 truncate text-body text-ink">{option.label}</span>
      <RowIconButton label={`Rename ${option.label}`} onClick={() => setRenaming(true)}>
        <Pencil aria-hidden="true" className="size-[14px]" />
      </RowIconButton>
      <RowIconButton label={`Move ${option.label} up`} disabled={index === 0} onClick={() => onMove(-1)}>
        <ChevronUp aria-hidden="true" className="size-[14px]" />
      </RowIconButton>
      <RowIconButton label={`Move ${option.label} down`} disabled={index === count - 1} onClick={() => onMove(1)}>
        <ChevronDown aria-hidden="true" className="size-[14px]" />
      </RowIconButton>
      <RowIconButton label={`Hide ${option.label}`} onClick={() => data.setOptionHidden(field.id, option.id, true)}>
        <Trash2 aria-hidden="true" className="size-[14px]" />
      </RowIconButton>
    </li>
  )
}
