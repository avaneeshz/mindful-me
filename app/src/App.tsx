import { Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Sidebar } from '@/components/Sidebar'
import { HeaderBar } from '@/components/HeaderBar'
import { AuthScreen } from '@/components/auth/AuthScreen'
import { TodayPage } from '@/routes/TodayPage'
import { HealthSyncPage } from '@/routes/HealthSyncPage'
import { HealthSyncCallbackPage } from '@/routes/HealthSyncCallbackPage'
import { AuthProvider, resolveGateView, useAuth } from '@/state/AuthContext'
import { BoardProvider, useBoard } from '@/state/BoardContext'
import { PickerDataProvider } from '@/state/PickerDataContext'
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

  // The ONE edit-mode toggle for the whole app — `HeaderBar`'s top-bar
  // "Edit" button used to own this locally (Today-only, before HeaderBar
  // was hoisted here); now that HeaderBar is app-wide chrome (see the shell
  // comment below) and `SlotEditor`'s inline `ActivityLibraryPanel` (a
  // TodayPage descendant, not a HeaderBar descendant) needs the exact same
  // flag, it has to live at the one ancestor both share. Passed down to
  // `TodayPage` as a prop rather than lifted into `BoardContext` — it's
  // page-level UI state, not board data, same reasoning `ThemeContext`
  // already documents for staying its own thing.
  const [editMode, setEditMode] = useState(false)

  return (
    // `PickerDataProvider` wraps `BoardProvider` (not the other way around)
    // because `BoardProvider` itself calls `useLiveActivityCatalogSync`,
    // which reads this context — see `PickerDataContext.tsx`'s own doc
    // comment for why both the live picker (`useLiveActivityCatalogSync`)
    // and the inline `ActivityLibraryPanel` (`SlotEditor`'s edit-mode panel,
    // also a descendant of this provider) must share this one instance, not
    // each mint their own.
    <PickerDataProvider>
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
                The page shell: max-width, horizontal padding, and the app-wide
                HeaderBar (date nav, sync status, edit-mode toggle, user menu)
                — hoisted here from TodayPage so every route shares one shell
                instead of each re-implementing its own (see git history for
                the "SHELL NOTE" this replaced). HeaderBar is genuinely
                app-wide chrome now, the same way Sidebar already is — Health
                Sync renders beside it, not a second copy of it.
              */}
              <div className="mx-auto flex w-full max-w-[1680px] flex-col px-2xl pt-lg mobile:px-lg mobile:pb-[132px] ipad-land:pt-md">
                <AppHeaderBar editMode={editMode} onToggleEditMode={() => setEditMode((value) => !value)} />
                <Routes>
                  <Route
                    path="/"
                    element={<TodayPage editMode={editMode} onCloseEditMode={() => setEditMode(false)} />}
                  />
                  <Route path="/health-sync" element={<HealthSyncPage />} />
                  <Route path="/health-sync/callback" element={<HealthSyncCallbackPage />} />
                  {/*
                    "Today" and "Health Sync" are the only routed screens.
                    "Activity Library" (PICKER-CUSTOM-1) isn't a route at all
                    — real user feedback turned it into `ActivityLibraryPanel`,
                    rendered inline by `SlotEditor` when the top-bar Edit
                    toggle above is on, rather than a second hidden path. Every
                    other sidebar entry remains a placeholder with no
                    destination.
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
    </PickerDataProvider>
  )
}

/**
 * Thin adapter between the app-wide providers (`BoardContext`, `AuthContext`)
 * and `HeaderBar`'s props — kept as its own component (rather than inlined in
 * `AuthedApp`) purely so `AuthedApp` itself doesn't need to know HeaderBar's
 * prop list. Must render inside `BoardProvider` (it does — see above).
 */
function AppHeaderBar({ editMode, onToggleEditMode }: { editMode: boolean; onToggleEditMode: () => void }) {
  const { state, dispatch, now, viewedDate, setViewedDate, syncQueue, retrySyncNow } = useBoard()
  const { user, signOut } = useAuth()

  return (
    <HeaderBar
      now={now}
      viewedDate={viewedDate}
      onSelectDate={setViewedDate}
      user={user}
      onSignOut={signOut}
      activities={state.activities}
      onQuickLog={(cardName, startMinutes, durationMinutes, extra) =>
        dispatch({ type: 'quickLogActivity', cardName, startMinutes, durationMinutes, ...extra })
      }
      syncQueue={syncQueue}
      onRetrySyncNow={retrySyncNow}
      onEditActivity={(id) => dispatch({ type: 'editActivity', id })}
      editMode={editMode}
      onToggleEditMode={onToggleEditMode}
    />
  )
}
