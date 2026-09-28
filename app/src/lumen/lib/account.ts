import { useAuth } from '@/state/AuthContext'

export interface LumenAccount {
  /** False in local-only mode (no Supabase project configured) — there is no account to show or sign out of. */
  signedIn: boolean
  /** A friendly first name derived from the email ("maya.rivera@…" → "Maya"), or null when there is nothing to derive it from. */
  firstName: string | null
  email: string | null
  /** Up to two letters for the avatar. */
  initials: string
  signOut: () => Promise<void>
}

/**
 * Pure: the display pieces Lumen shows for an account. The backend stores no
 * display name, so the email's local part is the only source.
 */
export function describeAccount(email: string | null): Pick<LumenAccount, 'firstName' | 'initials'> {
  const local = email?.split('@')[0] ?? ''
  const parts = local.split(/[._+-]+/).filter((part) => /[a-z]/i.test(part))
  if (parts.length === 0) return { firstName: null, initials: '' }
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
  const initials = parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
  return { firstName: cap(parts[0]), initials }
}

/** The signed-in person, as Lumen's header, profile menu and settings show them. */
export function useLumenAccount(): LumenAccount {
  const { user, signOut } = useAuth()
  const email = user?.email ?? null
  return { signedIn: user !== null, email, ...describeAccount(email), signOut }
}
