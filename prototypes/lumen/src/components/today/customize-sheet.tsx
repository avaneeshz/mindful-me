import { Button } from '@/components/ui/button'
import { IconBubble, Switch } from '@/components/ui/primitives'
import { Sheet } from '@/components/ui/sheet'
import { categories, metrics } from '@/lib/data'
import { useStore } from '@/lib/store'

export function CustomizeSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { hiddenCategories, toggleCategory, hiddenMetrics, toggleMetric } = useStore()
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Customize Today"
      description="Choose what shows up on your home screen."
      footer={
        <Button variant="primary" size="lg" className="w-full" onClick={() => onOpenChange(false)}>
          Done
        </Button>
      }
    >
      <p className="mb-1 text-xs font-medium uppercase tracking-[0.08em] text-ink-faint">Daily metrics</p>
      <ul className="divide-y divide-line/[0.06]">
        {metrics.map((m) => (
          <li key={m.id} className="flex min-h-14 items-center gap-3">
            <IconBubble icon={m.icon} hue={m.hue} size="sm" />
            <span className="flex-1 text-sm text-ink">{m.label}</span>
            <Switch checked={!hiddenMetrics.includes(m.id)} onChange={() => toggleMetric(m.id)} label={`Show ${m.label}`} />
          </li>
        ))}
      </ul>
      <p className="mb-1 mt-6 text-xs font-medium uppercase tracking-[0.08em] text-ink-faint">Categories</p>
      <ul className="divide-y divide-line/[0.06]">
        {categories.map((c) => (
          <li key={c.id} className="flex min-h-14 items-center gap-3">
            <IconBubble icon={c.icon} hue={c.hue} size="sm" />
            <span className="flex-1 text-sm text-ink">{c.label}</span>
            <Switch
              checked={!hiddenCategories.includes(c.id)}
              onChange={() => toggleCategory(c.id)}
              label={`Show ${c.label}`}
            />
          </li>
        ))}
      </ul>
    </Sheet>
  )
}
