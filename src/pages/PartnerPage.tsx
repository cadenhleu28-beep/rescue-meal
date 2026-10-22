import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Check, Hash, Minus, Plus, X } from 'lucide-react'
import type { Allergen, Category, Dietary, Listing, Venue } from '../types'
import { ALLERGENS, ALLERGEN_LABELS, CATEGORIES, CATEGORY_LABELS, DIETARY, DIETARY_LABELS } from '../data/labels'
import { isActive, listingState } from '../lib/listing'
import { MINUTE, ago, clock, duration, useNow } from '../lib/time'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { CATEGORY_ICONS } from '../components/CategoryIcon'
import { VerifyBusiness } from '../components/VerifyBusiness'
import { ListingCard } from '../components/ListingCard'
import { StatePill } from '../components/Status'

const START_OPTIONS = [
  { value: 0, label: 'Now' },
  { value: 30, label: 'In 30 min' },
  { value: 60, label: 'In 1 hour' },
  { value: 120, label: 'In 2 hours' },
]

const DURATION_OPTIONS = [30, 60, 90, 120, 180, 240]

const EXAMPLES: Record<Category, string> = {
  bakery: 'e.g. Day-old bagels and two trays of croissants',
  meals: 'e.g. Chicken and rice plates, packed to go',
  produce: 'e.g. Bruised apples and bagged greens',
  grocery: 'e.g. Yogurt and milk close to sell-by',
}

function toggle<T>(list: T[], item: T) {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item]
}

export default function PartnerPage() {
  const { status, venues } = useStore()
  const { userId } = useAuth()
  const venue = venues.find((v) => v.ownerId === userId)
  if (!venue) {
    return (
      <main className="partner">
        <p className="partner-loading">
          {status === 'error' ? 'Could not load your business. Try reloading the page.' : 'Loading your dashboard…'}
        </p>
      </main>
    )
  }
  if (venue.verificationStatus !== 'verified') return <VerifyBusiness venue={venue} />
  return <Dashboard venue={venue} />
}

function Dashboard({ venue }: { venue: Venue }) {
  const { listings, addListing, extendListing, markGone } = useStore()
  const now = useNow()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<Category>('bakery')
  const [portions, setPortions] = useState(10)
  const [dietary, setDietary] = useState<Dietary[]>([])
  const [allergens, setAllergens] = useState<Allergen[]>([])
  const [startIn, setStartIn] = useState(0)
  const [lasts, setLasts] = useState(90)
  const [pickupNote, setPickupNote] = useState('')
  const [safe, setSafe] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [toast, setToast] = useState<Listing | null>(null)
  const [tab, setTab] = useState<'active' | 'ended'>('active')
  const [posting, setPosting] = useState(false)
  const [postError, setPostError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const run = async (action: () => Promise<unknown>) => {
    setActionError(null)
    try {
      await action()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Something went wrong. Try again.')
    }
  }

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 8000)
    return () => clearTimeout(id)
  }, [toast])

  const from = now + startIn * MINUTE
  const until = from + lasts * MINUTE

  const errors = {
    title: title.trim() ? null : 'Say what the food is.',
    pickupNote: pickupNote.trim() ? null : 'Tell people where to find it.',
    safe: safe ? null : 'Confirm the food is safe to give away.',
  }
  const hasErrors = Object.values(errors).some(Boolean)
  const showError = (key: keyof typeof errors) => (submitted ? errors[key] : null)

  const draft: Listing = {
    id: 'draft',
    venueId: venue.id,
    title: title.trim() || EXAMPLES[category].replace('e.g. ', ''),
    description,
    category,
    dietary,
    allergens,
    portionsTotal: portions,
    portionsLeft: portions,
    postedAt: now,
    availableFrom: from,
    availableUntil: until,
    pickupNote,
  }

  const mine = useMemo(
    () =>
      listings
        .filter((l) => l.venueId === venue.id)
        .map((l) => ({ listing: l, state: listingState(l, now) }))
        .sort((a, b) => b.listing.postedAt - a.listing.postedAt),
    [listings, venue.id, now],
  )
  const activePosts = mine.filter((p) => isActive(p.state))
  const endedPosts = mine.filter((p) => !isActive(p.state))
  const pickedUp = mine.reduce((sum, p) => sum + (p.listing.portionsTotal - p.listing.portionsLeft), 0)

  const resetForm = () => {
    setTitle('')
    setDescription('')
    setPortions(10)
    setDietary([])
    setAllergens([])
    setStartIn(0)
    setLasts(90)
    setSafe(false)
    setSubmitted(false)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (hasErrors || posting) return
    setPosting(true)
    setPostError(null)
    try {
      const created = await addListing({
        title: title.trim(),
        description: description.trim(),
        category,
        dietary,
        allergens,
        portionsTotal: portions,
        // The form's clock ticks every 15s; never send a start time that's already in the past.
        availableFrom: Math.max(from, Date.now()),
        availableUntil: until,
        pickupNote: pickupNote.trim(),
      })
      setToast(created)
      setTab('active')
      resetForm()
    } catch (err) {
      setPostError(err instanceof Error ? err.message : 'Could not post. Try again.')
    }
    setPosting(false)
  }

  return (
    <main className="partner">
      <div className="partner-head">
        <div>
          <p className="partner-eyebrow">
            Your dashboard · <span className="verified-mark">Verified business</span>
          </p>
          <h1>{venue.name}</h1>
          <p className="partner-addr">
            {venue.address}, {venue.neighborhood}
          </p>
          {venue.isDemo && (
            <p className="partner-demo">
              This is a demo restaurant, so verification was skipped. Your posts appear only on your own{' '}
              <Link to="/find">map</Link>, not for anyone else.
            </p>
          )}
        </div>
        <dl className="partner-stats">
          <div>
            <dt>Live now</dt>
            <dd>{activePosts.length}</dd>
          </div>
          <div>
            <dt>Total posts</dt>
            <dd>{mine.length}</dd>
          </div>
          <div>
            <dt>Portions picked up</dt>
            <dd>{pickedUp}</dd>
          </div>
        </dl>
      </div>

      <div className="partner-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Post extra food</h2>
            <p>It shows up on the map as soon as you post.</p>
          </div>

          <form className="form" onSubmit={submit} noValidate>
            <fieldset className="field">
              <legend className="field-label">Type of food</legend>
              <div className="segmented">
                {CATEGORIES.map((c) => {
                  const Icon = CATEGORY_ICONS[c]
                  return (
                    <label key={c} className={`seg${category === c ? ' is-on' : ''}`}>
                      <input type="radio" name="category" value={c} checked={category === c} onChange={() => setCategory(c)} />
                      <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                      {CATEGORY_LABELS[c]}
                    </label>
                  )
                })}
              </div>
            </fieldset>

            <div className="field">
              <label className="field-label" htmlFor="title">
                What are you putting out?
              </label>
              <input
                id="title"
                className={`input${showError('title') ? ' has-error' : ''}`}
                placeholder={EXAMPLES[category]}
                value={title}
                maxLength={80}
                onChange={(e) => setTitle(e.target.value)}
              />
              {showError('title') && <p className="field-error">{errors.title}</p>}
            </div>

            <div className="field">
              <label className="field-label" htmlFor="description">
                Details <span className="optional">Optional</span>
              </label>
              <textarea
                id="description"
                className="textarea"
                rows={3}
                placeholder="How it's packed, what's in it, anything people should know"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="field">
              <span className="field-label" id="portions-label">
                About how many portions?
              </span>
              <div className="stepper" role="group" aria-labelledby="portions-label">
                <button type="button" onClick={() => setPortions(Math.max(1, portions - 1))} aria-label="Fewer portions">
                  <Minus size={16} />
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={500}
                  value={portions}
                  onChange={(e) => setPortions(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
                  aria-labelledby="portions-label"
                />
                <button type="button" onClick={() => setPortions(Math.min(500, portions + 1))} aria-label="More portions">
                  <Plus size={16} />
                </button>
              </div>
              <p className="field-hint">A best guess is fine. One portion is roughly what one person would take.</p>
            </div>

            <div className="field-row">
              <div className="field">
                <label className="field-label" htmlFor="start">
                  Available
                </label>
                <select id="start" className="select" value={startIn} onChange={(e) => setStartIn(Number(e.target.value))}>
                  {START_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="lasts">
                  For
                </label>
                <select id="lasts" className="select" value={lasts} onChange={(e) => setLasts(Number(e.target.value))}>
                  {DURATION_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {duration(m * MINUTE)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="field-hint window-hint">
              Pickup {clock(from)} – {clock(until)}. The post ends on its own after that.
            </p>

            <div className="field">
              <label className="field-label" htmlFor="pickup">
                Where should people pick it up?
              </label>
              <input
                id="pickup"
                className={`input${showError('pickupNote') ? ' has-error' : ''}`}
                placeholder="e.g. Ask at the counter, or the rack by the side door"
                value={pickupNote}
                onChange={(e) => setPickupNote(e.target.value)}
              />
              {showError('pickupNote') && <p className="field-error">{errors.pickupNote}</p>}
            </div>

            <fieldset className="field">
              <legend className="field-label">Dietary</legend>
              <div className="chip-wrap">
                {DIETARY.map((d) => {
                  const on = dietary.includes(d)
                  return (
                    <button
                      key={d}
                      type="button"
                      className={`chip chip--outline${on ? ' is-checked' : ''}`}
                      aria-pressed={on}
                      onClick={() => setDietary(toggle(dietary, d))}
                    >
                      {on && <Check size={14} strokeWidth={2.6} />}
                      {DIETARY_LABELS[d]}
                    </button>
                  )
                })}
              </div>
            </fieldset>

            <fieldset className="field">
              <legend className="field-label">Contains</legend>
              <div className="chip-wrap">
                {ALLERGENS.map((a) => {
                  const on = allergens.includes(a)
                  return (
                    <button
                      key={a}
                      type="button"
                      className={`chip chip--outline${on ? ' is-checked' : ''}`}
                      aria-pressed={on}
                      onClick={() => setAllergens(toggle(allergens, a))}
                    >
                      {on && <Check size={14} strokeWidth={2.6} />}
                      {ALLERGEN_LABELS[a]}
                    </button>
                  )
                })}
              </div>
            </fieldset>

            <label className={`check-row${showError('safe') ? ' has-error' : ''}`}>
              <input type="checkbox" checked={safe} onChange={(e) => setSafe(e.target.checked)} />
              <span>
                <strong>This food has been stored safely and is fit to eat</strong>
                <span className="field-hint">
                  Hot food kept hot, cold food kept cold, and nothing past its use-by date.{' '}
                  <Link to="/how-it-works#safety">Liability protection</Link>
                </span>
              </span>
            </label>
            {showError('safe') && <p className="field-error">{errors.safe}</p>}

            <div className="form-actions">
              <button type="submit" className="btn btn-primary btn-lg" disabled={posting}>
                {posting ? 'Posting…' : 'Post it'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={resetForm}>
                Clear
              </button>
            </div>
            {postError && (
              <p className="field-error" role="alert">
                {postError}
              </p>
            )}
          </form>
        </section>

        <div className="partner-side">
          <section className="panel">
            <div className="panel-head">
              <h2>Preview</h2>
              <p>How your post appears in the list.</p>
            </div>
            <div className="preview">
              <ListingCard listing={draft} venue={venue} state={listingState(draft, now)} now={now} miles={0.4} />
            </div>
          </section>

          <section className="panel">
            <div className="panel-head panel-head--row">
              <div>
                <h2>Your posts</h2>
                <p>Handing food over at the register? Open the counter and tap once per portion.</p>
              </div>
              <div className="tabs" role="tablist">
                <button type="button" role="tab" aria-selected={tab === 'active'} onClick={() => setTab('active')}>
                  Active <span>{activePosts.length}</span>
                </button>
                <button type="button" role="tab" aria-selected={tab === 'ended'} onClick={() => setTab('ended')}>
                  Ended <span>{endedPosts.length}</span>
                </button>
              </div>
            </div>

            {actionError && (
              <p className="field-error" role="alert">
                {actionError}
              </p>
            )}
            <ul className="posts">
              {(tab === 'active' ? activePosts : endedPosts).map(({ listing, state }) => (
                <li key={listing.id} className="post">
                  <div className="post-top">
                    <p className="post-title">{listing.title}</p>
                    <StatePill state={state} />
                  </div>
                  <p className="post-meta">
                    {state === 'ended' ? (
                      <>
                        {listing.portionsTotal - listing.portionsLeft} of {listing.portionsTotal} picked up · Ended{' '}
                        {ago(Math.min(listing.availableUntil, now), now)}
                      </>
                    ) : (
                      <>
                        {clock(listing.availableFrom)} – {clock(listing.availableUntil)}
                        {state !== 'upcoming' && <> · {duration(listing.availableUntil - now)} left</>}
                      </>
                    )}
                  </p>
                  {state !== 'ended' && (
                    <div className="post-controls">
                      <p className="post-count">
                        <strong>{listing.portionsLeft}</strong> of {listing.portionsTotal} left
                        {listing.portionsTotal > listing.portionsLeft && (
                          <> · {listing.portionsTotal - listing.portionsLeft} taken</>
                        )}
                      </p>
                      <Link to={`/partner/counter/${listing.id}`} className="btn btn-primary btn-sm">
                        <Hash size={15} strokeWidth={2.4} />
                        Open counter
                      </Link>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => run(() => extendListing(listing.id, 30))}
                      >
                        +30 min
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => run(() => markGone(listing.id))}>
                        Mark as gone
                      </button>
                      <Link to={`/find?l=${listing.id}`} className="post-link">
                        View on map
                      </Link>
                    </div>
                  )}
                </li>
              ))}
              {(tab === 'active' ? activePosts : endedPosts).length === 0 && (
                <li className="posts-empty">
                  {tab === 'active' ? 'Nothing posted right now. Use the form to put something out.' : 'No past posts yet.'}
                </li>
              )}
            </ul>
          </section>
        </div>
      </div>

      {toast && (
        <div className="toast" role="status">
          <Check size={18} strokeWidth={2.6} />
          <span>
            <strong>Posted.</strong> {toast.title} is on the map.
          </span>
          <Link to={`/find?l=${toast.id}`}>View it</Link>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}
    </main>
  )
}
