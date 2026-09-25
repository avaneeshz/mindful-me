import {
  BookOpen,
  Brain,
  Droplets,
  Footprints,
  ListChecks,
  Moon,
  Palette,
  Trees,
  Users,
  UtensilsCrossed,
  Beef,
  type LucideIcon,
} from 'lucide-react'
import { addDays, seeded, todayKey, currentSlot } from './utils'

export type Hue = 'accent' | 'sky' | 'mint' | 'lilac' | 'rose' | 'sun' | 'sand' | 'sage' | 'neutral'

/** Static class strings per hue so Tailwind can see them. */
export const hueStyles: Record<Hue, { icon: string; bubble: string; bar: string; ring: string }> = {
  accent: { icon: 'text-accent-ink', bubble: 'bg-accent/15', bar: 'bg-accent-ink', ring: 'ring-accent-ink/40' },
  sky: { icon: 'text-sky', bubble: 'bg-sky/[0.12]', bar: 'bg-sky', ring: 'ring-sky/40' },
  mint: { icon: 'text-mint', bubble: 'bg-mint/[0.12]', bar: 'bg-mint', ring: 'ring-mint/40' },
  lilac: { icon: 'text-lilac', bubble: 'bg-lilac/[0.12]', bar: 'bg-lilac', ring: 'ring-lilac/40' },
  rose: { icon: 'text-rose', bubble: 'bg-rose/[0.12]', bar: 'bg-rose', ring: 'ring-rose/40' },
  sun: { icon: 'text-sun', bubble: 'bg-sun/[0.12]', bar: 'bg-sun', ring: 'ring-sun/40' },
  sand: { icon: 'text-sand', bubble: 'bg-sand/[0.12]', bar: 'bg-sand', ring: 'ring-sand/40' },
  sage: { icon: 'text-sage', bubble: 'bg-sage/[0.12]', bar: 'bg-sage', ring: 'ring-sage/40' },
  neutral: { icon: 'text-ink-muted', bubble: 'bg-white/[0.06]', bar: 'bg-ink-faint', ring: 'ring-white/20' },
}

export type Activity = { id: string; label: string; minutes: number }

export type Category = {
  id: string
  label: string
  /** Short form for dense places (scrubber legend, charts) */
  short: string
  icon: LucideIcon
  hue: Hue
  activities: Activity[]
}

export const categories: Category[] = [
  {
    id: 'focus',
    label: 'Deep Focus',
    short: 'Focus',
    icon: Brain,
    hue: 'accent',
    activities: [
      { id: 'deep-work', label: 'Deep work block', minutes: 30 },
      { id: 'planning', label: 'Planning & review', minutes: 15 },
      { id: 'writing', label: 'Writing', minutes: 30 },
      { id: 'meetings', label: 'Meetings', minutes: 30 },
    ],
  },
  {
    id: 'move',
    label: 'Movement',
    short: 'Move',
    icon: Footprints,
    hue: 'sky',
    activities: [
      { id: 'run', label: 'Run', minutes: 30 },
      { id: 'strength', label: 'Strength training', minutes: 30 },
      { id: 'mobility', label: 'Mobility & stretch', minutes: 15 },
      { id: 'yoga', label: 'Yoga', minutes: 30 },
      { id: 'cycle', label: 'Cycling', minutes: 30 },
    ],
  },
  {
    id: 'nourish',
    label: 'Meals & Fuel',
    short: 'Meals',
    icon: UtensilsCrossed,
    hue: 'mint',
    activities: [
      { id: 'breakfast', label: 'Breakfast', minutes: 20 },
      { id: 'lunch', label: 'Lunch', minutes: 30 },
      { id: 'dinner', label: 'Dinner', minutes: 30 },
      { id: 'cooking', label: 'Cooking', minutes: 30 },
      { id: 'coffee', label: 'Coffee ritual', minutes: 10 },
    ],
  },
  {
    id: 'rest',
    label: 'Rest & Recover',
    short: 'Rest',
    icon: Moon,
    hue: 'lilac',
    activities: [
      { id: 'nap', label: 'Nap', minutes: 20 },
      { id: 'meditate', label: 'Meditation', minutes: 10 },
      { id: 'unwind', label: 'Unwind', minutes: 30 },
      { id: 'breathwork', label: 'Breathwork', minutes: 5 },
    ],
  },
  {
    id: 'people',
    label: 'Friends & Family',
    short: 'People',
    icon: Users,
    hue: 'rose',
    activities: [
      { id: 'call', label: 'Call a friend', minutes: 15 },
      { id: 'family-meal', label: 'Family meal', minutes: 30 },
      { id: 'date', label: 'Date night', minutes: 30 },
      { id: 'hangout', label: 'Hanging out', minutes: 30 },
    ],
  },
  {
    id: 'create',
    label: 'Make & Create',
    short: 'Create',
    icon: Palette,
    hue: 'sun',
    activities: [
      { id: 'sketch', label: 'Sketching', minutes: 30 },
      { id: 'music', label: 'Guitar practice', minutes: 30 },
      { id: 'photo', label: 'Photography', minutes: 30 },
      { id: 'side-project', label: 'Side project', minutes: 30 },
    ],
  },
  {
    id: 'learn',
    label: 'Read & Learn',
    short: 'Learn',
    icon: BookOpen,
    hue: 'sand',
    activities: [
      { id: 'reading', label: 'Reading', minutes: 30 },
      { id: 'course', label: 'Online course', minutes: 30 },
      { id: 'language', label: 'Language practice', minutes: 15 },
      { id: 'podcast', label: 'Podcast', minutes: 20 },
    ],
  },
  {
    id: 'outside',
    label: 'Time Outdoors',
    short: 'Outside',
    icon: Trees,
    hue: 'sage',
    activities: [
      { id: 'walk', label: 'Walk', minutes: 20 },
      { id: 'garden', label: 'Gardening', minutes: 30 },
      { id: 'sunlight', label: 'Morning sunlight', minutes: 10 },
      { id: 'hike', label: 'Hike', minutes: 30 },
    ],
  },
  {
    id: 'admin',
    label: 'Life Admin',
    short: 'Admin',
    icon: ListChecks,
    hue: 'neutral',
    activities: [
      { id: 'email', label: 'Inbox & messages', minutes: 15 },
      { id: 'errands', label: 'Errands', minutes: 30 },
      { id: 'chores', label: 'Chores', minutes: 20 },
      { id: 'finances', label: 'Finances', minutes: 15 },
    ],
  },
]

export const categoryById = Object.fromEntries(categories.map((c) => [c.id, c])) as Record<string, Category>

export function activityLabel(categoryId: string, activityId: string) {
  return categoryById[categoryId]?.activities.find((a) => a.id === activityId)?.label ?? activityId
}

export type MetricId = 'steps' | 'water' | 'protein'

export type MetricDef = {
  id: MetricId
  label: string
  unit: string
  goal: number
  step: number
  icon: LucideIcon
  hue: Hue
  format: (v: number) => string
}

export const metrics: MetricDef[] = [
  {
    id: 'steps',
    label: 'Steps',
    unit: 'steps',
    goal: 10000,
    step: 500,
    icon: Footprints,
    hue: 'sky',
    format: (v) => v.toLocaleString('en-US'),
  },
  {
    id: 'water',
    label: 'Water',
    unit: 'L',
    goal: 2.5,
    step: 0.25,
    icon: Droplets,
    hue: 'sky',
    format: (v) => v.toFixed(v % 1 === 0 ? 0 : 2).replace(/0$/, ''),
  },
  {
    id: 'protein',
    label: 'Protein',
    unit: 'g',
    goal: 90,
    step: 10,
    icon: Beef,
    hue: 'mint',
    format: (v) => String(Math.round(v)),
  },
]

export type Entry = {
  id: string
  slot: number
  categoryId: string
  activityId: string
  minutes: number
}

export type DayRecord = {
  entries: Entry[]
  metrics: Record<MetricId, number>
  wake: number // minutes past midnight
  windDown: number // minutes past midnight (may exceed 1440 for after-midnight)
}

/** A believable weekday, as [slot, category, activity, minutes] */
const template: [number, string, string, number][] = [
  [13, 'outside', 'sunlight', 10],
  [13, 'nourish', 'coffee', 10],
  [14, 'move', 'run', 30],
  [15, 'nourish', 'breakfast', 20],
  [15, 'admin', 'email', 10],
  [16, 'learn', 'reading', 30],
  [17, 'focus', 'planning', 15],
  [17, 'outside', 'walk', 15],
  [18, 'focus', 'deep-work', 30],
  [19, 'focus', 'deep-work', 30],
  [20, 'focus', 'deep-work', 30],
  [21, 'focus', 'meetings', 30],
  [22, 'focus', 'writing', 20],
  [22, 'people', 'call', 10],
  [23, 'create', 'sketch', 30],
  [24, 'nourish', 'lunch', 30],
  [25, 'outside', 'walk', 20],
  [25, 'rest', 'breathwork', 5],
  [26, 'focus', 'deep-work', 30],
  [27, 'focus', 'deep-work', 30],
  [28, 'focus', 'meetings', 30],
  [29, 'admin', 'errands', 30],
  [30, 'rest', 'nap', 20],
  [31, 'focus', 'writing', 30],
  [32, 'focus', 'planning', 15],
  [34, 'move', 'strength', 30],
  [35, 'move', 'mobility', 15],
  [36, 'nourish', 'cooking', 30],
  [37, 'people', 'family-meal', 30],
  [38, 'create', 'music', 30],
  [39, 'learn', 'course', 30],
  [40, 'people', 'hangout', 30],
  [41, 'rest', 'unwind', 30],
  [42, 'learn', 'reading', 20],
  [43, 'rest', 'meditate', 10],
]

let uid = 0
export const newId = () => `e${Date.now().toString(36)}${(uid++).toString(36)}`

function buildDay(dayOffset: number, cutoffSlot: number): DayRecord {
  const rand = seeded(9173 + dayOffset * 31)
  const weekendish = rand() < 0.25
  const entries: Entry[] = []
  for (const [slot, cat, act, minutes] of template) {
    if (slot >= cutoffSlot) continue
    // Past days drift: skip some blocks, swap focus for something else on lighter days.
    if (dayOffset !== 0 && rand() < 0.14) continue
    let categoryId = cat
    let activityId = act
    if (weekendish && cat === 'focus') {
      const pool: [string, string][] = [
        ['outside', 'hike'],
        ['people', 'hangout'],
        ['create', 'photo'],
        ['learn', 'reading'],
      ]
      ;[categoryId, activityId] = pool[Math.floor(rand() * pool.length)]
    }
    const jitter = dayOffset === 0 ? 0 : Math.round((rand() - 0.5) * 10)
    entries.push({
      id: `s${dayOffset}-${slot}-${activityId}`,
      slot,
      categoryId,
      activityId,
      minutes: Math.max(5, Math.min(30, minutes + jitter)),
    })
  }
  const r = seeded(401 + dayOffset * 7)
  return {
    entries,
    metrics:
      dayOffset === 0
        ? { steps: 6420, water: 1.25, protein: 90 }
        : {
            steps: Math.round((5200 + r() * 7400) / 10) * 10,
            water: Math.round((1.4 + r() * 1.4) * 4) / 4,
            protein: Math.round(55 + r() * 45),
          },
    wake: 6 * 60 + 30 + (dayOffset === 0 ? 0 : Math.round((r() - 0.5) * 4) * 15),
    windDown: 22 * 60 + 30 + (dayOffset === 0 ? 0 : Math.round((r() - 0.5) * 4) * 15),
  }
}

export function emptyDay(): DayRecord {
  return { entries: [], metrics: { steps: 0, water: 0, protein: 0 }, wake: 7 * 60, windDown: 22 * 60 + 30 }
}

export function seedDays(): Record<string, DayRecord> {
  const today = todayKey()
  const days: Record<string, DayRecord> = {}
  days[today] = buildDay(0, currentSlot())
  for (let i = 1; i <= 34; i++) days[addDays(today, -i)] = buildDay(i, 48)
  return days
}

export type Notice = { id: string; title: string; body: string; time: string; unread: boolean }

export const seedNotices: Notice[] = [
  {
    id: 'n1',
    title: 'Four-day movement streak',
    body: 'You’ve moved every morning since Monday. Keep the rhythm going.',
    time: '2h ago',
    unread: true,
  },
  {
    id: 'n2',
    title: 'Wind-down in 30 minutes',
    body: 'Screens off at 10:30 PM helps you hit your 6:30 wake time.',
    time: 'Yesterday',
    unread: true,
  },
  {
    id: 'n3',
    title: 'Your weekly reflection is ready',
    body: 'Focus time rose 18% while rest stayed steady.',
    time: 'Mon',
    unread: false,
  },
]
