import { describeSupabasePath, truncateText } from '@/domain/activityLog'
import { logActivity } from '@/lib/activityLogger'

/**
 * `fetch` for the Supabase client, recording every request to the user's
 * activity log: what was sent (full body) and what came back. This is the one
 * place that sees ALL server traffic, so no write path can be missed.
 *
 * Never logged: sign-in / token traffic (credentials) and, for edge
 * functions, anything beyond name + status (OAuth codes and tokens). Request
 * headers are never logged, so the access token is never copied.
 *
 * Logging must not change behaviour: the response is cloned and read in the
 * background, and any failure inside the logger is swallowed.
 */
export const loggedFetch: typeof fetch = async (input, init) => {
  let info: ReturnType<typeof describeSupabasePath> = null
  let method = 'GET'
  let body: string | undefined
  try {
    const request = input instanceof Request ? input : null
    const url = new URL(request ? request.url : String(input instanceof URL ? input.href : input))
    method = (init?.method ?? request?.method ?? 'GET').toUpperCase()
    info = describeSupabasePath(url.pathname)
    if (info && !info.sensitive && typeof init?.body === 'string') body = init.body
  } catch {
    info = null
  }
  if (!info) return fetch(input, init)

  const label = info.label
  const isWrite = method !== 'GET' && method !== 'HEAD'
  // Supabase reads over RPC are POSTs too — a body-less or `list_`/`get_` call is a read.
  const looksLikeRead = !isWrite || /^rpc\/(list|get|fetch)_/.test(label)
  const kind = looksLikeRead ? 'fetch' : 'send'

  let response: Response
  try {
    response = await fetch(input, init)
  } catch (error) {
    safely(() =>
      logActivity({
        kind,
        level: 'error',
        summary: `${method} ${label} — could not reach the server`,
        detail: { request: parseBody(body), error: error instanceof Error ? error.message : String(error) },
      }),
    )
    throw error
  }

  const status = response.status
  const copy = response.clone()
  void copy
    .text()
    .then((text) => {
      const ok = response.ok
      logActivity({
        kind,
        level: ok ? 'info' : 'error',
        summary: `${method} ${label} — ${ok ? 'ok' : 'rejected'} (${status})${ok ? rowCount(text) : ''}`,
        detail: info?.sensitive
          ? { status }
          : { request: parseBody(body), status, response: parseBody(looksLikeRead ? clip(text) : text) },
      })
    })
    .catch(() => undefined)
  return response
}

function rowCount(text: string): string {
  try {
    const parsed: unknown = JSON.parse(text)
    return Array.isArray(parsed) ? ` · ${parsed.length} row${parsed.length === 1 ? '' : 's'}` : ''
  } catch {
    return ''
  }
}

/** Reads can be large (whole histories) — keep enough to see what came back, not all of it. */
function clip(text: string): string {
  return truncateText(text, 20_000)
}

function parseBody(text: string | undefined): unknown {
  if (text === undefined || text === '') return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function safely(work: () => void): void {
  try {
    work()
  } catch {
    // Logging never breaks the request it describes.
  }
}
