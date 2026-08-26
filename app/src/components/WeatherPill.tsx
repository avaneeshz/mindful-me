import { useEffect, useState } from 'react'
import { Sun } from 'lucide-react'
import { Chip } from '@/components/ui/chip'
import { resolveWeather, type WeatherReading } from '@/lib/weather'
import { cn } from '@/lib/utils'

type WeatherState =
  | { status: 'loading' }
  | { status: 'ready'; reading: WeatherReading }
  | { status: 'unavailable' }

function formatTemperature(celsius: number): string {
  return `${Math.round(celsius)}°C`
}

/**
 * BL-3 — real device location + real temperature, city name only (no
 * address, no coordinates). Full UX states per CLAUDE.md: a loading
 * placeholder while geolocation/network resolve, a partial reading if only
 * one of city/temperature came back, and an honest "unavailable" state if
 * every path in `resolveWeather`'s chain failed — never a blank pill stuck
 * loading forever, and never anything that blocks the rest of the header.
 */
export function WeatherPill({ className }: { className?: string }) {
  const [state, setState] = useState<WeatherState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    resolveWeather()
      .then((reading) => {
        if (cancelled) return
        setState(reading ? { status: 'ready', reading } : { status: 'unavailable' })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'unavailable' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Chip size="sm" className={cn('font-semibold', className)} aria-live="polite">
      <Sun aria-hidden="true" className="size-[14px] text-muted" />
      {state.status === 'loading' && (
        <>
          <span className="sr-only">Loading weather…</span>
          <span aria-hidden="true" className="h-[12px] w-[64px] animate-pulse rounded-sm bg-line" />
        </>
      )}
      {state.status === 'unavailable' && <span className="text-muted">Weather unavailable</span>}
      {state.status === 'ready' && (
        <>
          {state.reading.temperatureC !== null && <span>{formatTemperature(state.reading.temperatureC)}</span>}
          {state.reading.city !== null && (
            <span className={state.reading.temperatureC !== null ? 'text-muted' : undefined}>
              {state.reading.city}
            </span>
          )}
        </>
      )}
    </Chip>
  )
}
