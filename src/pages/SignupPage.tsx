import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Search, Store, Utensils } from 'lucide-react'
import type { Role } from '../types'
import { homeFor, useAuth } from '../auth'
import { DEMO_CENTER, type LatLng } from '../lib/geo'
import { safeNext } from '../lib/nav'
import { LogoMark } from '../components/Logo'
import { LocationPicker, geocode } from '../components/LocationPicker'

const VENUE_KINDS = ['Restaurant', 'Bakery', 'Café', 'Grocery', 'Deli', 'Catering', 'Food truck']

const ROLES: { value: Role; title: string; body: string; Icon: typeof Utensils }[] = [
  { value: 'visitor', title: 'I’m looking for food', body: 'Reserve portions and let others know what’s left.', Icon: Utensils },
  { value: 'restaurant', title: 'I run a restaurant or store', body: 'Post extra food for people nearby to pick up.', Icon: Store },
]

export default function SignupPage() {
  const { profile, signUp } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))

  const [role, setRole] = useState<Role>(params.get('as') === 'restaurant' ? 'restaurant' : 'visitor')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [venueName, setVenueName] = useState('')
  const [venueKind, setVenueKind] = useState('Restaurant')
  const [address, setAddress] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [spot, setSpot] = useState<LatLng | null>(null)
  const [locating, setLocating] = useState(false)
  const [locateNote, setLocateNote] = useState<string | null>(null)

  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (profile && !busy) return <Navigate to={next ?? homeFor(profile)} replace />

  const isRestaurant = role === 'restaurant'
  const errors = {
    displayName: displayName.trim() ? null : 'Add your name.',
    email: /^\S+@\S+\.\S+$/.test(email.trim()) ? null : 'Enter a valid email.',
    password: password.length >= 8 ? null : 'Use at least 8 characters.',
    venueName: !isRestaurant || venueName.trim() ? null : 'Add the name of your business.',
    address: !isRestaurant || address.trim() ? null : 'Add the street address.',
    spot: !isRestaurant || spot ? null : 'Mark your location on the map.',
  }
  const showError = (key: keyof typeof errors) => (submitted ? errors[key] : null)

  const findOnMap = async () => {
    const q = [address, neighborhood].map((s) => s.trim()).filter(Boolean).join(', ')
    if (!q) {
      setLocateNote('Type the address first.')
      return
    }
    setLocating(true)
    setLocateNote(null)
    try {
      const hit = await geocode(q)
      if (hit) setSpot(hit)
      else setLocateNote('Couldn’t find that address. Tap the map to place the pin yourself.')
    } catch {
      setLocateNote('Address lookup isn’t available right now. Tap the map to place the pin.')
    }
    setLocating(false)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (Object.values(errors).some(Boolean)) return
    setBusy(true)
    setError(null)
    try {
      const p = await signUp({
        email: email.trim(),
        password,
        displayName: displayName.trim(),
        role,
        venue:
          isRestaurant && spot
            ? {
                name: venueName.trim(),
                kind: venueKind,
                address: address.trim(),
                neighborhood: neighborhood.trim(),
                lat: spot.lat,
                lng: spot.lng,
              }
            : undefined,
      })
      navigate(next ?? homeFor(p), { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your account. Try again.')
      setBusy(false)
    }
  }

  return (
    <main className="auth">
      <div className={`auth-card${isRestaurant ? ' auth-card--wide' : ''}`}>
        <LogoMark size={34} />
        <h1>Create your account</h1>
        <p className="auth-sub">Free for everyone. Takes about a minute.</p>

        <form className="form" onSubmit={submit} noValidate>
          <fieldset className="field">
            <legend className="field-label">Which describes you?</legend>
            <div className="role-pick">
              {ROLES.map(({ value, title, body, Icon }) => (
                <label key={value} className={`role-opt${role === value ? ' is-on' : ''}`}>
                  <input type="radio" name="role" value={value} checked={role === value} onChange={() => setRole(value)} />
                  <Icon size={20} strokeWidth={1.9} aria-hidden="true" />
                  <span>
                    <strong>{title}</strong>
                    <span>{body}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="field">
            <label className="field-label" htmlFor="name">
              Your name
            </label>
            <input
              id="name"
              className={`input${showError('displayName') ? ' has-error' : ''}`}
              autoComplete="name"
              maxLength={80}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            {showError('displayName') && <p className="field-error">{errors.displayName}</p>}
          </div>

          <div className="field-row">
            <div className="field">
              <label className="field-label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                className={`input${showError('email') ? ' has-error' : ''}`}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {showError('email') && <p className="field-error">{errors.email}</p>}
            </div>
            <div className="field">
              <label className="field-label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                className={`input${showError('password') ? ' has-error' : ''}`}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {showError('password') ? (
                <p className="field-error">{errors.password}</p>
              ) : (
                <p className="field-hint">At least 8 characters.</p>
              )}
            </div>
          </div>

          {isRestaurant && (
            <section className="auth-venue">
              <div>
                <h2>Your business</h2>
                <p className="field-hint">
                  After you sign up, you’ll send a license or permit so we can verify your business before you post.
                </p>
              </div>
              <div className="field-row">
                <div className="field">
                  <label className="field-label" htmlFor="venue-name">
                    Business name
                  </label>
                  <input
                    id="venue-name"
                    className={`input${showError('venueName') ? ' has-error' : ''}`}
                    autoComplete="organization"
                    maxLength={80}
                    value={venueName}
                    onChange={(e) => setVenueName(e.target.value)}
                  />
                  {showError('venueName') && <p className="field-error">{errors.venueName}</p>}
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="venue-kind">
                    Type
                  </label>
                  <select id="venue-kind" className="select" value={venueKind} onChange={(e) => setVenueKind(e.target.value)}>
                    {VENUE_KINDS.map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="field-row">
                <div className="field">
                  <label className="field-label" htmlFor="address">
                    Street address
                  </label>
                  <input
                    id="address"
                    className={`input${showError('address') ? ' has-error' : ''}`}
                    autoComplete="street-address"
                    placeholder="e.g. 584 Valencia St"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                  {showError('address') && <p className="field-error">{errors.address}</p>}
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="neighborhood">
                    Neighborhood or city
                  </label>
                  <input
                    id="neighborhood"
                    className="input"
                    placeholder="e.g. Menlo Park, Edison"
                    value={neighborhood}
                    onChange={(e) => setNeighborhood(e.target.value)}
                  />
                </div>
              </div>

              <div className="field">
                <div className="picker-head">
                  <span className="field-label">Pickup location</span>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={findOnMap} disabled={locating}>
                    <Search size={14} /> {locating ? 'Finding…' : 'Find address on map'}
                  </button>
                </div>
                <LocationPicker value={spot} fallbackCenter={DEMO_CENTER} onChange={setSpot} />
                {showError('spot') ? (
                  <p className="field-error">{errors.spot}</p>
                ) : (
                  <p className="field-hint">{locateNote ?? 'Tap the map or drag the pin to where people should come.'}</p>
                )}
              </div>
            </section>
          )}

          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
            {busy ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account? <Link to={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Log in</Link>
        </p>
      </div>
    </main>
  )
}
