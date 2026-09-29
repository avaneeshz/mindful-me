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
    expect(render()).toMatch(/<a[^>]*href="\/health-sync"[^>]*>.*Google Health/s)
  })

  it('shows unavailable providers as disabled, not as links', () => {
    auth.configured = true
    const html = render()
    expect(html).toContain('Whoop')
    expect(html).toContain('Strava')
    expect(html.match(/Coming soon/g)).toHaveLength(2)
    expect(html.match(/aria-disabled="true"/g)).toHaveLength(2)
  })

  it('offers no providers in local-only mode', () => {
    auth.configured = false
    const html = render()
    expect(html).toContain('Sign in with a real account')
    expect(html).not.toContain('Google Health')
  })
})
