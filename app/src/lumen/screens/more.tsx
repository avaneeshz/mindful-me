import { Bell, ChevronRight, Clock3, Download, HeartPulse, LayoutGrid, Lock, LogOut, Palette, Sparkles, UserRound, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Segmented, Switch } from '@/lumen/components/ui/primitives'
import { useLumenAccount } from '@/lumen/lib/account'
import { useInterfaceMode } from '@/state/InterfaceContext'
import type { InterfaceMode } from '@/lib/interfaceMode'
import { useStore } from '@/lumen/lib/store'

export function MoreScreen() {
  const { healthSync, toggleHealthSync } = useStore()
  const [reminders, setReminders] = useState(true)
  const [digest, setDigest] = useState(false)
  const { mode, setMode } = useInterfaceMode()
  const { signedIn, email, firstName, initials, signOut } = useLumenAccount()

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6">
      <header>
        <p className="text-sm text-ink-muted">More</p>
        <h1 className="mt-1 font-display text-3xl text-ink md:text-4xl">Settings</h1>
      </header>

      {signedIn && (
        <section className="surface flex items-center gap-4 rounded-panel p-5">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-accent/20 text-lg font-semibold text-accent-ink">
            {initials || <UserRound className="h-6 w-6" strokeWidth={1.8} aria-hidden="true" />}
          </span>
          <div className="min-w-0 flex-1">
            {firstName && <p className="text-lg font-medium text-ink">{firstName}</p>}
            <p className="truncate text-sm text-ink-muted">{email}</p>
          </div>
        </section>
      )}

      <Group title="Appearance">
        <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
          <span className="flex min-w-0 flex-1 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.05] text-ink-muted">
              <LayoutGrid className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] text-ink">Interface</span>
              <span className="block text-xs text-ink-muted">Same data either way — only the screens change</span>
            </span>
          </span>
          <Segmented<InterfaceMode>
            label="Interface"
            layoutId="interface-mode"
            className="sm:w-56"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'classic', label: 'Classic' },
              { value: 'lumen', label: 'Lumen' },
            ]}
          />
        </div>
      </Group>

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

      {signedIn && (
        <button
          type="button"
          onClick={() => void signOut()}
          className="surface flex min-h-14 items-center justify-center gap-2 rounded-card text-[15px] text-ink transition-colors hover:bg-white/[0.03]"
        >
          <LogOut className="h-4 w-4 text-ink-muted" strokeWidth={1.8} />
          Sign out
        </button>
      )}
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
