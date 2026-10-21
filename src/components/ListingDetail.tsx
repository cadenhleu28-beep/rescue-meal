import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, Clock, ExternalLink, Flag, Map as MapIcon, MapPin, Minus, Plus, ShoppingBag, Users } from 'lucide-react'
import type { Listing, ListingState, Venue } from '../types'
import { ALLERGEN_LABELS, CATEGORY_LABELS, DIETARY_LABELS } from '../data/labels'
import { directionsUrl, formatMiles } from '../lib/geo'
import { ago, clock, duration } from '../lib/time'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { loginLink } from '../lib/nav'
import { CategoryTile } from './CategoryIcon'
import { StatePill } from './Status'

interface Props {
  listing: Listing
  venue: Venue
  state: ListingState
  miles: number
  now: number
  onBack: () => void
  onShowMap: () => void
}

const REPORT_REASONS = ['Food was already gone', "Couldn't find the pickup spot", 'Food safety concern', 'Something else']

export function ListingDetail({ listing, venue, state, miles, now, onBack, onShowMap }: Props) {
  const { holds, pickups, reserve, cancelHold, pickUp, undoPickUp } = useStore()
  const { userId } = useAuth()
  const navigate = useNavigate()
  const [reporting, setReporting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Browsing is open to everyone; anything that changes a count needs an account.
  const signedIn = (then: () => void) => () => {
    if (userId) then()
    else navigate(loginLink(`/find?l=${listing.id}`))
  }

  const run = async (action: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.')
    }
    setBusy(false)
  }
  const hold = holds[listing.id]
  const activeHold = hold && hold.until > now ? hold : null
  const pickup = pickups[listing.id]
  // Portions this visitor could say they took: what's left, plus the one their reservation set aside.
  const canTake = listing.portionsLeft + (activeHold ? 1 : 0)
  const canPickUp = state !== 'upcoming' && state !== 'ended' && canTake > 0

  const windowMs = listing.availableUntil - listing.availableFrom
  const elapsed = Math.min(1, Math.max(0, (now - listing.availableFrom) / windowMs))
  const taken = listing.portionsTotal - listing.portionsLeft

  return (
    <article className="detail">
      <div className="detail-nav">
        <button type="button" className="btn btn-ghost btn-sm detail-back" onClick={onBack}>
          <ArrowLeft size={16} />
          All listings
        </button>
        <button type="button" className="btn btn-ghost btn-sm mobile-only" onClick={onShowMap}>
          <MapIcon size={16} />
          Show on map
        </button>
      </div>

      <header className="detail-head">
        <div className="detail-kicker">
          <CategoryTile category={listing.category} size={28} />
          <span>{CATEGORY_LABELS[listing.category]}</span>
          <StatePill state={state} />
        </div>
        <h1>{listing.title}</h1>
        <p className="detail-venue">
          <strong>{venue.name}</strong> · {venue.kind}
        </p>
        <p className="detail-addr">
          {venue.address}, {venue.neighborhood} · {formatMiles(miles)} away
        </p>
      </header>

      <div className="detail-stats">
        <section className="stat">
          <h2 className="stat-label">
            <Clock size={14} /> Pickup window
          </h2>
          <p className="stat-value">
            {clock(listing.availableFrom)} – {clock(listing.availableUntil)}
          </p>
          <div className="bar" aria-hidden="true">
            <i className={state === 'soon' ? 'is-soon' : ''} style={{ width: `${elapsed * 100}%` }} />
          </div>
          <p className={`stat-foot${state === 'soon' ? ' is-soon' : ''}`}>
            {state === 'upcoming'
              ? `Starts in ${duration(listing.availableFrom - now)}`
              : `${duration(listing.availableUntil - now)} left`}
          </p>
        </section>
        <section className="stat">
          <h2 className="stat-label">
            <Users size={14} /> Portions
          </h2>
          <p className="stat-value">
            {listing.portionsLeft} <span className="stat-of">of {listing.portionsTotal} left</span>
          </p>
          <div className="bar" aria-hidden="true">
            <i style={{ width: `${(listing.portionsLeft / listing.portionsTotal) * 100}%` }} />
          </div>
          <p className="stat-foot">{taken > 0 ? `${taken} picked up so far` : 'None picked up yet'}</p>
        </section>
      </div>

      {listing.description && <p className="detail-desc">{listing.description}</p>}

      <section className="pickup-note">
        <MapPin size={18} />
        <div>
          <h2>Where to pick up</h2>
          <p>{listing.pickupNote}</p>
        </div>
      </section>

      <section className="detail-section">
        <h2>Dietary and allergens</h2>
        {listing.dietary.length > 0 && (
          <div className="card-tags">
            {listing.dietary.map((d) => (
              <span key={d} className="tag">
                {DIETARY_LABELS[d]}
              </span>
            ))}
          </div>
        )}
        <p className="allergens">
          {listing.allergens.length > 0
            ? `Contains: ${listing.allergens.map((a) => ALLERGEN_LABELS[a]).join(', ')}.`
            : 'No common allergens listed.'}{' '}
          <span className="muted">This comes from {venue.name}. Ask staff if you're not sure.</span>
        </p>
      </section>

      <div className="detail-actions">
        {pickup ? (
          <div className="hold">
            <div className="hold-head">
              <Check size={18} strokeWidth={2.5} />
              <span>
                You took <strong>{pickup.portions === 1 ? '1 portion' : `${pickup.portions} portions`}</strong>
              </span>
            </div>
            <p>Thanks for letting others know. The count on the map is updated.</p>
            <div className="hold-actions">
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => undoPickUp(listing.id))}>
                Undo
              </button>
            </div>
          </div>
        ) : reporting && canPickUp ? (
          <TakePortions
            max={canTake}
            busy={busy}
            onConfirm={(n) =>
              run(async () => {
                await pickUp(listing.id, n)
                setReporting(false)
              })
            }
            onCancel={() => setReporting(false)}
          />
        ) : activeHold ? (
          <div className="hold">
            <div className="hold-head">
              <Check size={18} strokeWidth={2.5} />
              <span>
                Saved for you until <strong>{clock(activeHold.until)}</strong>
              </span>
            </div>
            <p>
              Show this code at pickup: <span className="hold-code">{activeHold.code}</span>
            </p>
            <div className="hold-actions">
              <a className="btn btn-primary" href={directionsUrl(venue)} target="_blank" rel="noreferrer">
                Get directions <ExternalLink size={15} />
              </a>
              <button type="button" className="btn btn-secondary" onClick={() => setReporting(true)}>
                <ShoppingBag size={15} /> I picked it up
              </button>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => run(() => cancelHold(listing.id))}>
                Cancel reservation
              </button>
            </div>
          </div>
        ) : (
          <>
            {listing.reservable ? (
              <button
                type="button"
                className="btn btn-primary btn-lg"
                disabled={busy || state === 'upcoming' || listing.portionsLeft <= 0}
                onClick={signedIn(() => run(() => reserve(listing.id)))}
              >
                Reserve a portion
              </button>
            ) : null}
            <a
              className={`btn btn-lg ${listing.reservable ? 'btn-secondary' : 'btn-primary'}`}
              href={directionsUrl(venue)}
              target="_blank"
              rel="noreferrer"
            >
              Get directions <ExternalLink size={15} />
            </a>
            {canPickUp && (
              <button type="button" className="btn btn-secondary btn-lg take-btn" onClick={signedIn(() => setReporting(true))}>
                <ShoppingBag size={16} /> I took some
              </button>
            )}
            <p className="actions-note">
              {!userId
                ? 'Log in to reserve a portion or say how much you took.'
                : listing.reservable
                ? state === 'upcoming'
                  ? `Reservations open at ${clock(listing.availableFrom)}.`
                  : 'Reservations hold one portion for 20 minutes.'
                : 'First come, first served. No reservations for this one.'}
            </p>
          </>
        )}
        {error && (
          <p className="actions-error" role="alert">
            {error}
          </p>
        )}
      </div>

      <footer className="detail-foot">
        <span>Posted {ago(listing.postedAt, now)}</span>
        <ReportProblem key={listing.id} />
      </footer>
    </article>
  )
}

interface TakePortionsProps {
  max: number
  busy: boolean
  onConfirm: (n: number) => void
  onCancel: () => void
}

function TakePortions({ max, busy, onConfirm, onCancel }: TakePortionsProps) {
  const [count, setCount] = useState(1)
  const n = Math.min(count, max)

  return (
    <form
      className="take"
      onSubmit={(e) => {
        e.preventDefault()
        onConfirm(n)
      }}
    >
      <p className="take-label" id="take-label">
        How many portions did you take?
      </p>
      <div className="take-row">
        <div className="stepper" role="group" aria-labelledby="take-label">
          <button type="button" onClick={() => setCount(Math.max(1, n - 1))} disabled={n <= 1} aria-label="One fewer">
            <Minus size={16} />
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={max}
            value={n}
            onChange={(e) => setCount(Math.max(1, Math.min(max, Number(e.target.value) || 1)))}
            aria-labelledby="take-label"
          />
          <button type="button" onClick={() => setCount(Math.min(max, n + 1))} disabled={n >= max} aria-label="One more">
            <Plus size={16} />
          </button>
        </div>
        <span className="take-of">of {max} left</span>
      </div>
      <p className="take-hint">This updates the count so the next person knows what's still there.</p>
      <div className="hold-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Confirm'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function ReportProblem() {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  if (sent) return <span className="report-sent">Thanks. We'll look into it.</span>

  if (!open)
    return (
      <button type="button" className="link-btn" onClick={() => setOpen(true)}>
        <Flag size={13} /> Report a problem
      </button>
    )

  return (
    <form
      className="report"
      onSubmit={(e) => {
        e.preventDefault()
        if (reason) setSent(true)
      }}
    >
      <fieldset>
        <legend>What went wrong?</legend>
        {REPORT_REASONS.map((r) => (
          <label key={r} className="radio">
            <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} />
            {r}
          </label>
        ))}
      </fieldset>
      <div className="report-actions">
        <button type="submit" className="btn btn-secondary btn-sm" disabled={!reason}>
          Send report
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  )
}
