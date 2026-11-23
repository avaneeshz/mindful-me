import { DictationField } from '@/components/ui/DictationButton'
import { visibleOptions, type ActivityField, type FieldValues } from '@/domain/activityFields'
import { MultiselectFieldPicker } from './MultiselectFieldPicker'

const TEXTAREA =
  'pr-5xl w-full resize-y rounded-md border border-line bg-bg px-md py-sm text-note text-ink placeholder:text-ink-dim focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

/**
 * The activity's own notes and multiple-select fields, in the order the user
 * arranged them: a note is a text area titled with its own name, a
 * multiple-select field is a group of toggle chips of its own options. Hidden
 * fields and options are not offered — except an option already chosen on
 * this entry, which stays visible (and can be unticked) so editing an old
 * entry never hides what it recorded.
 */
export function ActivityFieldInputs({
  fields,
  values,
  onSetText,
  onToggleLabel,
  compact,
}: {
  fields: readonly ActivityField[]
  values: FieldValues
  onSetText: (fieldId: string, text: string) => void
  onToggleLabel: (fieldId: string, label: string) => void
  /** The narrower header quick-log popup: smaller captions and shorter text areas. */
  compact?: boolean
}) {
  return (
    <>
      {fields
        .filter((f) => !f.hidden)
        .map((field) => {
          const value = values[field.id]
          if (field.kind === 'text') {
            return (
              <DictationField key={field.id}>
                <textarea
                  value={value?.text ?? ''}
                  onChange={(event) => onSetText(field.id, event.target.value)}
                  aria-label={field.label}
                  placeholder={field.label}
                  rows={compact ? 2 : 3}
                  className={TEXTAREA}
                />
              </DictationField>
            )
          }
          const selected = value?.labels ?? []
          const offered = visibleOptions(field).map((o) => o.label)
          const options = [...offered, ...selected.filter((label) => !offered.includes(label))]
          return (
            <MultiselectFieldPicker
              key={field.id}
              label={field.label}
              options={options}
              selected={selected}
              onToggle={(label) => onToggleLabel(field.id, label)}
              compact={compact}
            />
          )
        })}
    </>
  )
}
