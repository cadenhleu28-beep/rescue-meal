import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { homeFor, useAuth } from '../auth'
import { safeNext } from '../lib/nav'
import { LogoMark } from '../components/Logo'
import { TryDemo } from '../components/TryDemo'

export default function LoginPage() {
  const { profile, logIn } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (profile && !busy) return <Navigate to={next ?? homeFor(profile)} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const p = await logIn(email.trim(), password)
      navigate(next ?? homeFor(p), { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log in. Try again.')
      setBusy(false)
    }
  }

  return (
    <main className="auth">
      <div className="auth-card">
        <LogoMark size={34} />
        <h1>Log in</h1>
        <p className="auth-sub">Welcome back to Rescue Meal.</p>

        <form className="form" onSubmit={submit} noValidate>
          <div className="field">
            <label className="field-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
            {busy ? 'Logging in…' : 'Log in'}
          </button>
        </form>

        <p className="auth-switch">
          New here? <Link to={`/signup${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Create an account</Link>
        </p>
        <TryDemo className="try-demo" />
      </div>
    </main>
  )
}
