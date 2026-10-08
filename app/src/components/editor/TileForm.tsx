import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { fieldClass } from '@/components/ui/formField'
import { ICON_CHOICES } from '@/lib/iconRegistry'
import { IconPicker } from '@/components/editor/IconPicker'

/**
 * Add/rename form shared by "add a tile" and "rename this tile" — same
 * fields either way (name + `IconPicker`: built-in or uploaded icons). Used inside the
 * tile-row edit popover (`TileEditPanel`) and the "Add tile" popover.
 */
export function TileForm({
  initialLabel = '',
  initialIcon = ICON_CHOICES[0].key,
  onSave,
  onCancel,
}: {
  initialLabel?: string
  initialIcon?: string
  onSave: (label: string, iconKey: string) => void
  onCancel: () => void
}) {
  const [label, setLabel] = useState(initialLabel)
  const [iconKey, setIconKey] = useState(initialIcon)

  return (
    <form
      className="flex flex-col gap-md rounded-md border border-line bg-surface p-md"
      onSubmit={(e) => {
        e.preventDefault()
        if (label.trim() === '') return
        onSave(label.trim(), iconKey)
      }}
    >
      <input
        autoFocus
        className={fieldClass}
        placeholder="Tile name"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        aria-label="Tile name"
      />
      <IconPicker value={iconKey} onChange={setIconKey} />
      <div className="flex justify-end gap-sm">
        <Button type="button" variant="ghost" size="inline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="inline" disabled={label.trim() === ''}>
          Save
        </Button>
      </div>
    </form>
  )
}
