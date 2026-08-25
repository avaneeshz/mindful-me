import { Moon, Sun, type LucideIcon } from 'lucide-react'
import type { Period } from '@/domain/types'

/* ---------------------------------------------------------------------------
 * Presentation constants for the two timeline periods.
 *
 * These previously lived in components/PeriodNavigator.tsx and were imported by
 * components/Timeline.tsx — a sibling-to-sibling data dependency that made the
 * navigator look like the owner of vocabulary the timeline also depends on.
 * They belong beside data/activities.ts, which pairs labels with icons the same
 * way for categories and flags.
 *
 * The period RULES (which slot indices each row covers, where midnight falls)
 * stay in domain/slots.ts. This file is copy and iconography only.
 * ------------------------------------------------------------------------- */

export const PERIOD_LABELS: Record<Period, string> = {
  day: 'Day · 6a–6p',
  night: 'Night · 6p–6a',
}

export const PERIOD_ICONS: Record<Period, LucideIcon> = { day: Sun, night: Moon }
