import { Loader2 } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Sidebar } from '@/components/Sidebar'
import { HeaderBar } from '@/components/HeaderBar'
import { AuthScreen } from '@/components/auth/AuthScreen'
import { InterfaceErrorBoundary } from '@/components/InterfaceErrorBoundary'
import { TodayPage } from '@/routes/TodayPage'
import { HealthSyncPage } from '@/routes/HealthSyncPage'
import { HealthSyncCallbackPage } from '@/routes/HealthSyncCallbackPage'
import { SettingsPage } from '@/routes/SettingsPage'
import { AddDevicePage } from '@/routes/AddDevicePage'
import { ActivityLogPage } from '@/routes/ActivityLogPage'
import { NeedsAttentionPage } from '@/routes/NeedsAttentionPage'
import { StorageNotice } from '@/components/StorageNotice'
import { AuthProvider, resolveGateView, useAuth } from '@/state/AuthContext'
import { BoardProvider, useBoard } from '@/state/BoardContext'
import { PickerDataProvider } from '@/state/PickerDataContext'
import { HeaderButtonsProvider } from '@/state/HeaderButtonsContext'
import { InterfaceProvider, useInterfaceMode } from '@/state/InterfaceContext'
import { ThemeProvider } from '@/state/ThemeContext'
import { EditModeProvider, useEditMode } from '@/state/EditModeContext'
import { EditLockHint } from '@/components/ui/EditLock'
import { useHealthAutoSync } from '@/state/useHealthAutoSync'
import { cn } from '@/lib/utils'

// Lumen is a whole second interface; people on Classic never download it.
const LumenApp = lazy(() => import('@/lumen/LumenApp'))

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
      <InterfaceProvider>
        <AuthProvider>
          <AuthGate now={now} />
        </AuthProvider>
      </InterfaceProvider>
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
  const { mode } = useInterfaceMode()
  const view = resolveGateView(configured, status)
  // Keeps connected health data fresh in both interfaces while signed in.
  useHealthAutoSync(configured && status === 'signedIn')

  if (view === 'loading') {
    return <FullScreenLoader />
  }

  if (view === 'authScreen') {
    return <AuthScreen />
  }

  // The Classic / Lumen switch (`state/InterfaceContext.tsx`). Only the
  // signed-in product differs; sign-in itself is shared.
  //
  // `InterfaceErrorBoundary` (found missing in review): neither branch had
  // anything above it to catch a render error, so a crash in either
  // interface blanked the whole screen with no way back except a manual
  // refresh. `key={mode}` remounts the boundary itself on every switch, so a
  // crash on one side can never linger into the other.
  return (
    <InterfaceErrorBoundary key={mode}>
      {mode === 'lumen' ? (
        <Suspense fallback={<FullScreenLoader />}>
          <LumenApp />
        </Suspense>
      ) : (
        <AuthedApp now={now} />
      )}
    </InterfaceErrorBoundary>
  )
}

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <Loader2 aria-hidden="true" className="size-[28px] animate-spin text-ink" />
      <span className="sr-only">Loading…</span>
    </div>
  )
}

function AuthedApp({ now }: { now?: Date }) {
  const mainRef = useRef<HTMLElement>(null)
  const hasContentBelow = useHasContentBelow(mainRef)

  return (
    // `PickerDataProvider` wraps `BoardProvider` (not the other way around)
    // because `BoardProvider` itself calls `useLiveActivityCatalogSync`,
    // which reads this context — see `PickerDataContext.tsx`'s own doc
    // comment for why both the live picker (`useLiveActivityCatalogSync`)
    // and the inline tile editor (`EditableTileRow`, also a
    // descendant of this provider) must share this one instance, not
    // each mint their own.
    <PickerDataProvider>
      <HeaderButtonsProvider>
        <BoardProvider now={now}>
          {/*
            Edit mode (header + Today) lives in its own small context — see
            `state/EditModeContext.tsx`. Inside BoardProvider so entering it
            can drop any half-finished log (`CancelLoggingOnEdit`).
          */}
          <EditModeProvider>
          <CancelLoggingOnEdit />
          <EditLockHint />
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
                  <AppHeaderBar />
                  <StorageNotice className="mt-lg" />
                  <Routes>
                    <Route
                      path="/"
                      element={<TodayPage />}
                    />
                    <Route path="/health-sync" element={<HealthSyncPage />} />
                    <Route path="/health-sync/callback" element={<HealthSyncCallbackPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/settings/devices/add" element={<AddDevicePage />} />
                    <Route path="/settings/activity-log" element={<ActivityLogPage />} />
                    <Route path="/settings/not-synced" element={<NeedsAttentionPage />} />
                    {/*
                      "Today", "Health Sync" and "Settings" (with its Add device
                      picker) are the only routed screens.
                      "Activity Library" (PICKER-CUSTOM-1) isn't a route at all
                      — it is the inline tile editor on Today (`EditableTileRow`),
                      on whenever the top-bar Edit toggle above is on. The
                      per-user option lists live in Settings. Every
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
          </EditModeProvider>
        </BoardProvider>
      </HeaderButtonsProvider>
    </PickerDataProvider>
  )
}

/**
 * Thin adapter between the app-wide providers (`BoardContext`, `AuthContext`)
 * and `HeaderBar`'s props — kept as its own component (rather than inlined in
 * `AuthedApp`) purely so `AuthedApp` itself doesn't need to know HeaderBar's
 * prop list. Must render inside `BoardProvider` (it does — see above).
 */
function AppHeaderBar() {
  const { editMode, toggleEditMode } = useEditMode()
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
      onToggleEditMode={toggleEditMode}
    />
  )
}

/**
 * Entering Edit mode drops anything half-logged: a staged pick (and its
 * open Log modal) is cancelled and a selected activity is deselected, so
 * Slot Details shows the tile editor rather than logging controls.
 */
function CancelLoggingOnEdit() {
  const { editMode } = useEditMode()
  const { dispatch } = useBoard()
  useEffect(() => {
    if (!editMode) return
    dispatch({ type: 'cancelStaging' })
    dispatch({ type: 'selectScheduledActivity', id: null })
  }, [editMode, dispatch])
  return null
}
