import { Moon, Sun, type LucideIcon } from 'lucide-react'
import type { Period } from '@/domain/types'

/* ---------------------------------------------------------------------------
 * Presentation constants for the two timeline periods.
 *
 * Iconography only — the Sun/Moon end-cap each timeline row wears. The former
 * Day/Night jump-navigator (and the "Day · 6a–6p" / "Night · 6p–6a" copy it
 * used) was removed: both rows are always visible on the timeline, so the
 * toggle only duplicated what the rows already show.
 *
 * The period RULES (which slot indices each row covers, where midnight falls)
 * stay in domain/slots.ts. This file is iconography only.
 * ------------------------------------------------------------------------- */

export const PERIOD_ICONS: Record<Period, LucideIcon> = { day: Sun, night: Moon }
