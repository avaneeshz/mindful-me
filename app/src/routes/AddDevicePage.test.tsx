import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

const auth = vi.hoisted(() => ({ configured: true }))
vi.mock('@/state/AuthContext', () => ({ useAuth: () => ({ configured: auth.configured }) }))

import { AddDevicePage } from './AddDevicePage'

function render(): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <AddDevicePage />
    </MemoryRouter>,
  )
}

describe('AddDevicePage', () => {
  it('links the available provider to its connect path', () => {
    auth.configured = true
    expect(render()).toMatch(/<a[^>]*href="\/health-sync"[^>]*>.*Fitbit &amp; Google Health/s)
  })

  it('lists Fitbit & Google Health as the only option, with no disabled placeholders', () => {
    auth.configured = true
    const html = render()
    expect(html).toContain('Fitbit &amp; Google Health')
    expect(html).not.toContain('Whoop')
    expect(html).not.toContain('Strava')
    expect(html).not.toContain('aria-disabled')
  })

  it('offers no providers in local-only mode', () => {
    auth.configured = false
    const html = render()
    expect(html).toContain('Sign in with a real account')
    expect(html).not.toContain('Fitbit')
  })
})
