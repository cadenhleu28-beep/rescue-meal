import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle2, Minus, Undo2, X } from 'lucide-react'
import type { Listing } from '../types'
import { ENDING_SOON_MS } from '../lib/listing'
import { ago, clock, duration, useNow } from '../lib/time'
import { useStore } from '../store'
import { useAuth } from '../auth'

const UNDO_MS = 8000

/** Keeps the screen on while the counter is open, so the phone at the register doesn't lock. */
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | undefined
    let closed = false
    // The browser drops the lock whenever the tab is hidden, so take it again on return.
    const acquire = async () => {
      if (document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return
      try {
        lock = await navigator.wakeLock.request('screen')
        if (closed) void lock.release()
      } catch {
        // Not allowed here (low battery mode, older browser). The counter works without it.
      }
    }
    void acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      closed = true
      document.removeEventListener('visibilitychange', acquire)
      void lock?.release()
    }
  }, [])
}

export default function CounterPage() {
  const { id } = useParams()
  const { status, listings, venues } = useStore()
  const { userId } = useAuth()
  const venue = venues.find((v) => v.ownerId === userId)
  const listing = listings.find((l) => l.id === id && l.venueId === venue?.id)

  if (!listing) {
    return (
      <main className="counter">
        <div className="counter-missing">
          <p>
            {status === 'loading'
              ? 'Loading…'
              : status === 'error'
                ? 'Could not load your posts. Try reloading the page.'
                : 'This post isn’t one of yours, or it was removed.'}
          </p>
          {status !== 'loading' && (
            <Link to="/partner" className="btn btn-secondary">
              Back to dashboard
            </Link>
          )}
        </div>
      </main>
    )
  }
  return <Counter listing={listing} />
}

function Counter({ listing }: { listing: Listing }) {
  const { handOut, undoHandOut } = useStore()
  const now = useNow(5_000)
  useWakeLock()

  // Taps show up right away. `pending` is the part the database hasn't confirmed yet.
  const [pending, setPending] = useState(0)
  // Taps in the current burst that Undo can still take back.
  const [undoable, setUndoable] = useState(0)
  const [error, setError] = useState<string | null>(null)
  // Requests go out one at a time, in order, so an undo can't overtake the tap it undoes.
  const queue = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    if (!undoable) return
    const t = setTimeout(() => setUndoable(0), UNDO_MS)
    return () => clearTimeout(t)
  }, [undoable])

  const send = (change: 1 | -1, action: () => Promise<void>) => {
    setPending((p) => p + change)
    setError(null)
    queue.current = queue.current.then(async () => {
      try {
        await action()
      } catch (e) {
        setUndoable(0)
        setError(e instanceof Error ? e.message : 'Could not save that. Try again.')
      } finally {
        setPending((p) => p - change)
      }
    })
  }

  const left = Math.max(0, Math.min(listing.portionsTotal, listing.portionsLeft + pending))
  const done = left === 0 || !!listing.markedGone

  const tap = () => {
    if (done) return
    navigator.vibrate?.(15)
    setUndoable((n) => n + 1)
    send(-1, () => handOut(listing.id))
  }

  const undo = () => {
    if (!undoable) return
    setUndoable((n) => n - 1)
    send(1, () => undoHandOut(listing.id))
  }

  const timeLeft = listing.availableUntil - now
  const tone = timeLeft <= 0 ? 'ended' : timeLeft <= ENDING_SOON_MS ? 'soon' : 'live'
  const timeText =
    now < listing.availableFrom
      ? `Pickup starts ${clock(listing.availableFrom)}`
      : timeLeft > 0
        ? `${duration(timeLeft)} left · until ${clock(listing.availableUntil)}`
        : `Pickup time ended ${ago(listing.availableUntil, now)}`

  return (
    <main className="counter">
      <div className="counter-bar">
        <Link to="/partner" className="counter-exit">
          <X size={20} strokeWidth={2.4} />
          Exit counter
        </Link>
        <p className={`counter-time counter-time--${tone}`}>
          <span className="counter-dot" aria-hidden="true" />
          {timeText}
        </p>
      </div>

      <div className="counter-readout">
        <p className="counter-title">{listing.title}</p>
        <p className="counter-num" aria-live="polite">
          <strong>{left}</strong>
          <span>of {listing.portionsTotal} left</span>
        </p>
        {error && (
          <p className="counter-error" role="alert">
            {error}
          </p>
        )}
      </div>

      {/* Always takes up space, so the big button never moves between taps. */}
      <div className="counter-undo" role="status">
        {undoable > 0 && (
          <>
            <span>Logged {undoable === 1 ? '1 portion' : `${undoable} portions`}</span>
            <button type="button" onClick={undo}>
              <Undo2 size={18} strokeWidth={2.4} />
              Undo (−1)
            </button>
          </>
        )}
      </div>

      {done ? (
        <div className="counter-done">
          <CheckCircle2 size={44} strokeWidth={2.2} />
          <p>{listing.markedGone ? 'Marked as gone' : 'All portions handed out'}</p>
          <span>
            {listing.portionsTotal - left} of {listing.portionsTotal} picked up. The post is off the map.
          </span>
        </div>
      ) : (
        <button type="button" className="counter-tap" onClick={tap} autoFocus>
          <Minus size={36} strokeWidth={3} />
          Log 1 portion handed out
        </button>
      )}
    </main>
  )
}
