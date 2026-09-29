import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  /** Remounts the boundary (clearing any caught error) whenever this changes — the Classic/Lumen switch's own `mode`, so a crash in one interface doesn't permanently block switching to the other. */
  resetKey: string
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Found in review: neither the Classic/Lumen switch nor Lumen's own lazy
 * chunk (`App.tsx`'s `<Suspense><LumenApp/></Suspense>`) had an error
 * boundary anywhere above them — an uncaught render error in either
 * interface (a stale chunk after a redeploy, a real data shape the code
 * didn't expect, anything) unmounted the WHOLE React tree with nothing left
 * to render, a blank/white screen with no way back except a manual browser
 * refresh. This is the one thing standing between that and a recoverable
 * screen: same fallback the rest of this app uses for a failed load
 * (`FullScreenLoader`'s own visual language), with a real way out.
 *
 * A boundary can't recover on its own — React unmounts the failed subtree
 * for good once it catches — so `key={mode}` at the call site (see
 * `App.tsx`) is what actually lets switching away from the crashed
 * interface work again; this component only needs to reset its own error
 * state to match when that happens, via `resetKey` changing.
 */
export class InterfaceErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // eslint-disable-next-line no-console
    console.error('[InterfaceErrorBoundary] caught a render error', error, info.componentStack)
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-md bg-bg px-lg text-center">
          <p className="text-body font-semibold text-ink">Something went wrong loading this view.</p>
          <p className="text-caption text-ink-dim">Your data is safe — this screen just needs a fresh start.</p>
          <Button variant="primary" size="control" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
