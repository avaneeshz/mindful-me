import { FRAME_HEADER, getFrame } from '@/lib/frame'

/**
 * Wraps `fetch` so every database request (PostgREST: tables and `rpc/`) names
 * the frame it is for. The backend scopes rows, defaults new rows' frame and
 * scopes every function to it from this header.
 *
 * Only `/rest/v1/` gets it: auth and edge-function calls have no use for it, and
 * a custom header on an edge function would need that function to allow it in
 * its CORS preflight. A header the caller already set wins.
 */
export function withFrameHeader(inner: typeof fetch, frame: () => number = getFrame): typeof fetch {
  return (input, init) => {
    let isRest = false
    try {
      const raw = input instanceof Request ? input.url : input instanceof URL ? input.href : String(input)
      isRest = new URL(raw, 'http://localhost').pathname.includes('/rest/v1/')
    } catch {
      isRest = false
    }
    if (!isRest) return inner(input, init)

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    if (!headers.has(FRAME_HEADER)) headers.set(FRAME_HEADER, String(frame()))
    return inner(input, { ...init, headers })
  }
}
