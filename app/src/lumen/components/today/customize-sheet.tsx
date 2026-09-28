import { Button } from '@/lumen/components/ui/button'
import { IconBubble, Switch } from '@/lumen/components/ui/primitives'
import { Sheet } from '@/lumen/components/ui/sheet'
import { useStore } from '@/lumen/lib/store'

/** What shows on Today. Per device: hiding a tile here only tidies this screen — it never touches the tile itself. */
export function CustomizeSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { allTiles, hiddenTiles, toggleTile } = useStore()
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
    </Sheet>
  )
}
