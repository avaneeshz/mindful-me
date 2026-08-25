import type { LucideIcon } from 'lucide-react'
import type { Category } from '@/domain/types'
import { cn } from '@/lib/utils'

/**
 * 32px icon chip: the category's DEEP tone as the icon colour on a 15%-opacity
 * wash of the same tone.
 *
 * The DEEP tone is used here and on picker tiles only — the LIGHT pastel tone
 * stays reserved exclusively for timeline strip fill.
 */
export function CategoryIconChip({
  category,
  icon: Icon,
  className,
}: {
  category: Category
  icon?: LucideIcon
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn('flex size-chip shrink-0 items-center justify-center rounded-sm', className)}
      style={{
        background: `color-mix(in srgb, ${category.deep} 15%, transparent)`,
        color: category.deep,
      }}
    >
      {Icon ? <Icon className="size-[16px]" /> : null}
    </span>
  )
}
