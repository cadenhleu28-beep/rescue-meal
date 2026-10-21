import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { homeFor, useAuth } from '../auth'
import type { Role } from '../types'

/** "Try the demo" links: sign in with a throwaway account as either side, no form to fill in. */
export function TryDemo({ className }: { className?: string }) {
  const { tryDemo } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState<Role | null>(null)
  const [error, setError] = useState<string | null>(null)

  const start = async (role: Role) => {
    setBusy(role)
    setError(null)
    try {
      const p = await tryDemo(role)
      navigate(homeFor(p))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the demo. Try again.')
      setBusy(null)
    }
  }

  return (
    <div className={className}>
      <p>
        Just looking? Try it without an account, as{' '}
        <button type="button" className="link-btn try-demo-btn" disabled={busy !== null} onClick={() => start('visitor')}>
          {busy === 'visitor' ? 'opening the map…' : 'someone looking for food'}
        </button>{' '}
        or as{' '}
        <button type="button" className="link-btn try-demo-btn" disabled={busy !== null} onClick={() => start('restaurant')}>
          {busy === 'restaurant' ? 'opening the dashboard…' : 'a restaurant'}
        </button>
        .
      </p>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
