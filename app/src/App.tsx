import { Loader2 } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Sidebar } from '@/components/Sidebar'
import { AuthScreen } from '@/components/auth/AuthScreen'
import { TodayPage } from '@/routes/TodayPage'
import { AuthProvider, resolveGateView, useAuth } from '@/state/AuthContext'
import { BoardProvider } from '@/state/BoardContext'
import { cn } from '@/lib/utils'

interface AppProps {
  /** Pins "now" for deterministic tests. Omitted in the real app. */
  now?: Date
}

/**
 * Code-split: Recharts is a genuinely heavy dependency, and most sessions
 * only ever touch "Today". Nothing about this changes what renders — only
 * when its JS is fetched (on first navigation to `/insights`, not on the
 * initial app load).
 */
const InsightsPage = lazy(() => import('@/routes/InsightsPage').then((m) => ({ default: m.InsightsPage })))

/** Ignore sub-pixel rounding; only a real remainder counts as "more below". */
const SCROLL_EPSILON = 4

/**
 * True while the element still has content below its visible area.
 *
 * Watches the container AND its content, because the thing that pushes content
 * past the fold here is the editor growing (a second activity, the capacity
 * message appearing) — not the window resizing.
 */
function useHasContentBelow(ref: React.RefObject<HTMLElement | null>): boolean {
  const [hasMore, setHasMore] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const update = () =>
      setHasMore(el.scrollHeight - el.scrollTop - el.clientHeight > SCROLL_EPSILON)

    update()
    el.addEventListener('scroll', update, { passive: true })

    const observer = new ResizeObserver(update)
    observer.observe(el)
    if (el.firstElementChild) observer.observe(el.firstElementChild)

    return () => {
      el.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [ref])

  return hasMore
}

export default function App({ now }: AppProps = {}) {
  return (
    <AuthProvider>
      <AuthGate now={now} />
    </AuthProvider>
  )
}

/**
 * The app-level auth gate: a Supabase project not being configured at all
 * (`resolveGateView`, `state/AuthContext.tsx`) falls straight through to the
 * product exactly as it always has — local-only, no login required (rule 6).
 * Otherwise this is what stands between "unauthenticated" and the real
 * timeline/editor experience, which is rendered completely unchanged once
 * signed in.
 */
function AuthGate({ now }: { now?: Date }) {
  const { configured, status } = useAuth()
  const view = resolveGateView(configured, status)

  if (view === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <Loader2 aria-hidden="true" className="size-[28px] animate-spin text-forest" />
        <span className="sr-only">Loading…</span>
      </div>
    )
  }

  if (view === 'authScreen') {
    return <AuthScreen />
  }

  return <AuthedApp now={now} />
}

function RouteLoading() {
  return (
    <div className="flex min-h-[240px] items-center justify-center" role="status" aria-live="polite">
      <Loader2 aria-hidden="true" className="size-[24px] animate-spin text-forest" />
      <span className="sr-only">Loading…</span>
    </div>
  )
}

function AuthedApp({ now }: { now?: Date }) {
  const mainRef = useRef<HTMLElement>(null)
  const hasContentBelow = useHasContentBelow(mainRef)

  return (
    <BoardProvider now={now}>
      <div className="flex h-full mobile:h-auto mobile:flex-col">
        <Sidebar />

        {/*
          <main> — not the document — is the product's scroll container, which
          is why a document-level overflow check reports "nothing to scroll"
          even when it is overflowing. The wrapper exists purely to anchor the
          bottom scroll cue over it.
        */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          <main
            ref={mainRef}
            className="min-h-0 flex-1 overflow-y-auto mobile:overflow-visible"
          >
            {/*
              The shared page shell (max-width, horizontal padding) — hoisted
              here per the note that used to live in this spot, so every route
              shares one shell instead of each one carrying its own copy.
              Route-specific chrome (HeaderBar on Today, the granularity/date
              nav on Insights) stays inside each page.
            */}
            <div className="mx-auto flex w-full max-w-[1680px] flex-col px-2xl pt-lg mobile:px-lg mobile:pb-[132px] ipad-land:pt-md">
              <Routes>
                <Route path="/" element={<TodayPage />} />
                <Route
                  path="/insights"
                  element={
                    <Suspense fallback={<RouteLoading />}>
                      <InsightsPage />
                    </Suspense>
                  }
                />
                {/*
                  "Today" and "Insights" are the only built screens. The
                  remaining sidebar entries are placeholders with no
                  destination, exactly as they are today.
                */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          </main>

          {/*
            Acceptance Criterion 13 backstop: a soft depth fade at the fold
            whenever content genuinely continues below it, so a control that
            lands just past the edge on a short viewport is discoverable rather
            than invisible. Touch devices show no resting scrollbar, so without
            this there is no cue at all. Hidden on mobile, where the document —
            not this container — scrolls.
          */}
          <span
            aria-hidden="true"
            className={cn(
              'scroll-cue-bottom pointer-events-none absolute inset-x-0 bottom-0 h-2xl',
              'transition-opacity duration-200 ease-out-soft mobile:hidden',
              hasContentBelow ? 'opacity-100' : 'opacity-0',
            )}
          />
        </div>
      </div>
    </BoardProvider>
  )
}
