import { APP_SECTIONS, type AppSectionId } from '@/domain/appLanguage'
import { useEditMode } from '@/state/EditModeContext'
import { cn } from '@/lib/utils'

/**
 * Names a section of the Today screen while Edit mode is on, so people learn
 * the product's words (`domain/appLanguage.ts`). Renders nothing otherwise.
 */
export function EditSectionLabel({
  section,
  className,
  editMode: editModeProp,
}: {
  section: AppSectionId
  className?: string
  /** Overrides the context flag — for components that already take `editMode` as a prop. */
  editMode?: boolean
}) {
  const { editMode: editModeFromContext } = useEditMode()
  const editMode = editModeProp ?? editModeFromContext
  if (!editMode) return null
  const { name, description } = APP_SECTIONS[section]
  return (
    <div className={cn('flex flex-col gap-[2px] border-l-2 border-ink pl-sm', className)} data-section-label={section}>
      <span className="text-nano font-bold uppercase tracking-tag text-ink">{name}</span>
      <span className="text-caption text-ink-dim">{description}</span>
    </div>
  )
}
