import type { LucideIcon } from 'lucide-react'
import type { Category } from '@/domain/types'
import { cn } from '@/lib/utils'

/**
 * 32px icon chip, shown beside each activity already logged in a slot's
 * list. No colour any more (Section A) — a flat `surface-2` wash with an
 * `ink` icon, the same theme-following pair everything else uses. `category`
 * is still accepted (some callers pass it for the icon fallback below) but
 * its `deep`/`light` tones are no longer read — see `data/activities.ts`'s
 * colour-system comment for why they're kept as inert data.
 */
export function CategoryIconChip({
  category: _category,
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
      className={cn('flex size-chip shrink-0 items-center justify-center rounded-sm bg-surface-2 text-ink', className)}
    >
      {Icon ? <Icon className="size-[16px]" /> : null}
    </span>
  )
}
