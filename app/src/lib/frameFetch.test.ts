import { describe, expect, it, vi } from 'vitest'
import { frameKey, isFrame } from './frame'
import { withFrameHeader } from './frameFetch'

function capture() {
  const inner = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('[]'))
  return { inner, sent: () => new Headers(inner.mock.calls[0]?.[1]?.headers) }
}

describe('withFrameHeader', () => {
  it('adds x-frame to table and rpc requests', async () => {
    const { inner, sent } = capture()
    await withFrameHeader(inner as unknown as typeof fetch, () => 3)('https://x.supabase.co/rest/v1/header_buttons?select=*')
    expect(sent().get('x-frame')).toBe('3')
    const rpc = capture()
    await withFrameHeader(rpc.inner as unknown as typeof fetch, () => 2)('https://x.supabase.co/rest/v1/rpc/set_daily_value', { method: 'POST' })
    expect(rpc.sent().get('x-frame')).toBe('2')
  })

  it('keeps the caller headers and lets an explicit x-frame win', async () => {
    const { inner, sent } = capture()
    await withFrameHeader(inner as unknown as typeof fetch, () => 3)('https://x.supabase.co/rest/v1/tiles', {
      headers: { apikey: 'k', 'x-frame': '4' },
    })
    expect(sent().get('apikey')).toBe('k')
    expect(sent().get('x-frame')).toBe('4')
  })

  it('leaves auth and edge-function requests alone', async () => {
    for (const url of ['https://x.supabase.co/auth/v1/token', 'https://x.supabase.co/functions/v1/transcribe']) {
      const { inner } = capture()
      await withFrameHeader(inner as unknown as typeof fetch, () => 2)(url, { headers: { a: 'b' } })
      expect(new Headers(inner.mock.calls[0]?.[1]?.headers).has('x-frame')).toBe(false)
    }
  })
})

describe('frame keys', () => {
  it('keeps the original key for frame 1 and namespaces the rest', () => {
    expect(frameKey('mindful-me:notes:', 1)).toBe('mindful-me:notes:')
    expect(frameKey('mindful-me:notes:', 3)).toBe('mindful-me:notes::f3')
  })

  it('only accepts frames 1 to 4', () => {
    expect([0, 1, 4, 5, 1.5, '2', null].map(isFrame)).toEqual([false, true, true, false, false, false, false])
  })
})
