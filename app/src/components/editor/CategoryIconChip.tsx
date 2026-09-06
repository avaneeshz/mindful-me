import type { LucideIcon } from 'lucide-react'
import type { CatalogCategory } from '@/domain/catalog'
import { cn } from '@/lib/utils'

/**
 * 32px icon chip, shown beside each activity already logged in a slot's
 * list. No colour any more (Section A) — a flat `surface-2` wash with an
 * `ink` icon, the same theme-following pair everything else uses. `category`
 * is still accepted (some callers pass it for the icon fallback below) but
 * its label is not otherwise read here — see `data/activities.ts`'s
 * colour-system comment for the retired per-category tones this once carried.
 */
export function CategoryIconChip({
  category: _category,
  icon: Icon,
  className,
}: {
  category: CatalogCategory | undefined
  icon?: LucideIcon
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn('flex size-chip shrink-0 items-center justify-center rounded-sm bg-surface-2 text-ink', className)}
    >
      {Icon ? <Icon className="size-[16px]" /> : null}
    </span>
  )
}
