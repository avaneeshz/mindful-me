import { Bell, ChevronRight, Clock3, Download, HeartPulse, Lock, Palette, Sparkles, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Switch } from '@/components/ui/primitives'
import { useStore } from '@/lib/store'

export function MoreScreen() {
  const { healthSync, toggleHealthSync } = useStore()
  const [reminders, setReminders] = useState(true)
  const [digest, setDigest] = useState(false)

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6">
      <header>
        <p className="text-sm text-ink-muted">More</p>
        <h1 className="mt-1 font-display text-3xl text-ink md:text-4xl">Settings</h1>
      </header>

      <section className="surface flex items-center gap-4 rounded-panel p-5">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-accent/20 text-lg font-semibold text-accent-ink">MR</span>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-medium text-ink">Maya Rivera</p>
          <p className="text-sm text-ink-muted">maya@example.com</p>
        </div>
        <span className="rounded-full border border-mint/30 bg-mint/10 px-3 py-1 text-xs font-medium text-mint">Plus</span>
      </section>

      <Group title="Tracking">
        <Row icon={HeartPulse} label="Health sync" hint="Steps and sleep from your phone">
          <Switch checked={healthSync !== 'off'} onChange={toggleHealthSync} label="Health sync" />
        </Row>
        <Row icon={Clock3} label="Slot length" value="30 min" />
        <Row icon={Palette} label="Categories" value="9 active" />
      </Group>

      <Group title="Notifications">
        <Row icon={Bell} label="Gentle check-ins" hint="A nudge when a slot goes unlogged">
          <Switch checked={reminders} onChange={() => setReminders((r) => !r)} label="Gentle check-ins" />
        </Row>
        <Row icon={Sparkles} label="Weekly reflection" hint="Sunday evening summary">
          <Switch checked={digest} onChange={() => setDigest((d) => !d)} label="Weekly reflection" />
        </Row>
      </Group>

      <Group title="Data">
        <Row icon={Download} label="Export all data" value="CSV" />
        <Row icon={Lock} label="Privacy" value="On device" />
      </Group>

      <p className="pb-4 text-center text-xs text-ink-faint">Lumen prototype · v0.1</p>
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-[0.08em] text-ink-faint">{title}</h2>
      <div className="surface divide-y divide-line/[0.06] overflow-hidden rounded-card">{children}</div>
    </section>
  )
}

function Row({ icon: Icon, label, hint, value, children }: { icon: LucideIcon; label: string; hint?: string; value?: string; children?: React.ReactNode }) {
  const body = (
    <>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.05] text-ink-muted">
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] text-ink">{label}</span>
        {hint && <span className="block text-xs text-ink-muted">{hint}</span>}
      </span>
      {children ?? (
        <>
          {value && <span className="text-sm text-ink-muted">{value}</span>}
          <ChevronRight className="h-4 w-4 text-ink-faint" />
        </>
      )}
    </>
  )
  if (children) return <div className="flex min-h-16 items-center gap-3 px-4 py-3">{body}</div>
  return (
    <button type="button" className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]">
      {body}
    </button>
  )
}
