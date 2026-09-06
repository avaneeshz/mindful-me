import { Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Sidebar } from '@/components/Sidebar'
import { AuthScreen } from '@/components/auth/AuthScreen'
import { TodayPage } from '@/routes/TodayPage'
import { AuthProvider, resolveGateView, useAuth } from '@/state/AuthContext'
import { BoardProvider } from '@/state/BoardContext'
import { CatalogProvider } from '@/state/CatalogContext'
import { SettingsPage } from '@/routes/SettingsPage'
import { ThemeProvider } from '@/state/ThemeContext'
import { cn } from '@/lib/utils'

interface AppProps {
  /** Pins "now" for deterministic tests. Omitted in the real app. */
  now?: Date
}

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
    <ThemeProvider>
      <AuthProvider>
        <AuthGate now={now} />
      </AuthProvider>
    </ThemeProvider>
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
        <Loader2 aria-hidden="true" className="size-[28px] animate-spin text-ink" />
        <span className="sr-only">Loading…</span>
      </div>
    )
  }

  if (view === 'authScreen') {
    return <AuthScreen />
  }

  return <AuthedApp now={now} />
}

function AuthedApp({ now }: { now?: Date }) {
  const mainRef = useRef<HTMLElement>(null)
  const hasContentBelow = useHasContentBelow(mainRef)

  return (
    <CatalogProvider>
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
                SHELL NOTE for whoever adds the second screen: the page shell
                (max-width, horizontal padding, HeaderBar) currently lives inside
                TodayPage, not here. That is fine while "Today" is the only route,
                but do NOT copy-paste it into the new route — hoist it to this
                level first, so both screens share one shell instead of two that
                drift apart.
              */}
              <Routes>
                <Route path="/" element={<TodayPage />} />
                {/* Settings/Configuration — the Sidebar's own "Settings" entry now
                    links here for real (see Sidebar.tsx). Every other sidebar entry
                    is still a placeholder with no destination, exactly as before. */}
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
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
    </CatalogProvider>
  )
}
