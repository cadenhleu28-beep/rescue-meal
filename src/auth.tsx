import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Profile, Role } from './types'
import { supabase } from './lib/supabase'

export interface VenueDetails {
  name: string
  kind: string
  address: string
  neighborhood: string
  lat: number
  lng: number
}

export interface SignUpInput {
  email: string
  password: string
  displayName: string
  role: Role
  venue?: VenueDetails
}

interface AuthValue {
  status: 'loading' | 'ready'
  session: Session | null
  userId: string | null
  profile: Profile | null
  signUp: (input: SignUpInput) => Promise<Profile>
  logIn: (email: string, password: string) => Promise<Profile>
  /** Signs in with a new throwaway account, so people can try the app without signing up. */
  tryDemo: (role: Role) => Promise<Profile>
  logOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

async function fetchProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').select('id, role, display_name, is_admin').eq('id', userId).single()
  if (error) throw new Error(error.message)
  return { id: data.id, role: data.role, displayName: data.display_name, isAdmin: data.is_admin }
}

// Supabase's messages are written for developers; reword the ones people actually hit.
function friendly(message: string) {
  if (/invalid login credentials/i.test(message)) return 'That email and password don’t match an account.'
  if (/already registered/i.test(message)) return 'There’s already an account with that email. Try logging in.'
  if (/password should be at least/i.test(message)) return 'Use a password with at least 8 characters.'
  if (/database error saving new user/i.test(message)) return 'We couldn’t create that account. Check the restaurant details and try again.'
  return message
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthValue['status']>('loading')
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    let cancelled = false

    const apply = async (next: Session | null) => {
      setSession(next)
      if (!next) {
        setProfile(null)
      } else {
        try {
          const p = await fetchProfile(next.user.id)
          if (!cancelled) setProfile(p)
        } catch {
          // A session without a profile is left over from the old anonymous visitors. Clear it.
          await supabase.auth.signOut()
          if (!cancelled) {
            setSession(null)
            setProfile(null)
          }
        }
      }
      if (!cancelled) setStatus('ready')
    }

    supabase.auth.getSession().then(({ data }) => apply(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      // Token refreshes don't change who's signed in.
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // Defer: Supabase warns against awaiting its own calls inside this callback.
        setTimeout(() => apply(next), 0)
      }
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const signUp = useCallback(async ({ email, password, displayName, role, venue }: SignUpInput) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role,
          display_name: displayName,
          ...(venue && {
            venue_name: venue.name,
            venue_kind: venue.kind,
            venue_address: venue.address,
            venue_neighborhood: venue.neighborhood,
            venue_lat: venue.lat,
            venue_lng: venue.lng,
          }),
        },
      },
    })
    if (error) throw new Error(friendly(error.message))
    if (!data.session) throw new Error('Account created. Check your email to confirm it, then log in.')
    const p = await fetchProfile(data.session.user.id)
    setSession(data.session)
    setProfile(p)
    return p
  }, [])

  const logIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(friendly(error.message))
    const p = await fetchProfile(data.user.id)
    setSession(data.session)
    setProfile(p)
    return p
  }, [])

  // A demo account is a normal account with a made-up email and a random password nobody sees.
  // The database gives a demo restaurant its own pre-verified venue that only it can see.
  const tryDemo = useCallback(async (role: Role) => {
    const id = crypto.randomUUID()
    const { data, error } = await supabase.auth.signUp({
      email: `guest-${id.slice(0, 12)}@example.com`,
      password: crypto.randomUUID(),
      options: {
        data: { role, display_name: role === 'restaurant' ? 'Demo restaurant' : 'Guest', demo: true },
      },
    })
    if (error) throw new Error(friendly(error.message))
    if (!data.session) throw new Error('The demo isn’t available right now. Try signing up instead.')
    const p = await fetchProfile(data.session.user.id)
    setSession(data.session)
    setProfile(p)
    return p
  }, [])

  const logOut = useCallback(async () => {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
  }, [])

  const value = useMemo<AuthValue>(
    () => ({ status, session, userId: profile ? session?.user.id ?? null : null, profile, signUp, logIn, tryDemo, logOut }),
    [status, session, profile, signUp, logIn, tryDemo, logOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** Where someone lands after logging in or signing up. */
export function homeFor(profile: Profile) {
  return profile.role === 'restaurant' ? '/partner' : '/find'
}
