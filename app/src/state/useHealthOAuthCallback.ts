import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiExchangeHealthOAuthCode } from '@/api/healthSync'
import { consumeGoogleHealthOAuthState, healthSyncRedirectUri } from '@/lib/googleHealthOAuth'

export type HealthOAuthCallbackView = 'exchanging' | 'success' | 'error'

/**
 * The return leg of the Google Health sign-in, shared by both interfaces:
 * verify the CSRF `state`, hand the one-time code to the Edge Function that
 * does the real (server-side, secret-holding) token exchange, then call
 * `onSuccess`. Rendering the result is each interface's own job.
 */
export function useHealthOAuthCallback(onSuccess: () => void) {
  const [searchParams] = useSearchParams()
  const [view, setView] = useState<HealthOAuthCallbackView>('exchanging')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const ranRef = useRef(false)
  const onSuccessRef = useRef(onSuccess)
  onSuccessRef.current = onSuccess

  useEffect(() => {
    // StrictMode / a re-render must never exchange the same one-time code
    // twice — Google's authorization codes are single-use.
    if (ranRef.current) return
    ranRef.current = true

    const oauthError = searchParams.get('error')
    if (oauthError) {
      setErrorMessage(oauthError === 'access_denied' ? 'Google sign-in was cancelled.' : `Google returned an error: ${oauthError}`)
      setView('error')
      return
    }

    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const expectedState = consumeGoogleHealthOAuthState()
    if (!code || !state || !expectedState || state !== expectedState) {
      setErrorMessage('This sign-in link is no longer valid. Please try connecting again.')
      setView('error')
      return
    }

    apiExchangeHealthOAuthCode(code, healthSyncRedirectUri()).then((result) => {
      if (result.ok) {
        setView('success')
        onSuccessRef.current()
      } else {
        setErrorMessage(result.message ?? 'Could not finish connecting Google Health.')
        setView('error')
      }
    })
  }, [searchParams])

  return { view, errorMessage }
}
