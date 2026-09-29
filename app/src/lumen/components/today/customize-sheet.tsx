import { ChevronRight, Rows3, Shapes } from 'lucide-react'
import { Button } from '@/lumen/components/ui/button'
import { IconBubble, Switch } from '@/lumen/components/ui/primitives'
import { Sheet } from '@/lumen/components/ui/sheet'
import { useStore } from '@/lumen/lib/store'

/** What shows on Today. Per device: hiding a tile here only tidies this screen — it never touches the tile itself. */
export function CustomizeSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { allTiles, hiddenTiles, toggleTile, openSettings } = useStore()
  const go = (view: 'library' | 'buttons') => {
    onOpenChange(false)
    openSettings(view)
  }
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Customize Today"
      description="Choose which tiles show up on your home screen."
      footer={
        <Button variant="primary" size="lg" className="w-full" onClick={() => onOpenChange(false)}>
          Done
        </Button>
      }
    >
      <p className="mb-1 text-xs font-medium uppercase tracking-[0.08em] text-ink-faint">Tiles</p>
      <ul className="divide-y divide-line/[0.06]">
        {allTiles.map((t) => (
          <li key={t.id} className="flex min-h-14 items-center gap-3">
            <IconBubble icon={t.icon} color={t.color.id} size="sm" />
            <span className="flex-1 text-sm text-ink">{t.label}</span>
            <Switch checked={!hiddenTiles.includes(t.id)} onChange={() => toggleTile(t.id)} label={`Show ${t.label}`} />
          </li>
        ))}
      </ul>

      <p className="mb-1 mt-6 text-xs font-medium uppercase tracking-[0.08em] text-ink-faint">Edit</p>
      <ul className="divide-y divide-line/[0.06]">
        {(
          [
            { view: 'library', icon: Shapes, label: 'Tiles & activities' },
            { view: 'buttons', icon: Rows3, label: 'Header buttons' },
          ] as const
        ).map(({ view, icon: Icon, label }) => (
          <li key={view}>
            <button type="button" onClick={() => go(view)} className="flex min-h-14 w-full items-center gap-3 text-left text-sm text-ink transition-colors hover:text-ink">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-white/[0.05] text-ink-muted">
                <Icon className="h-4 w-4" strokeWidth={1.8} />
              </span>
              <span className="flex-1">{label}</span>
              <ChevronRight className="h-4 w-4 text-ink-faint" />
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}
