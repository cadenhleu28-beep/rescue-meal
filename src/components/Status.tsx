import type { Listing, ListingState } from '../types'
import { clock, duration } from '../lib/time'
import { LOW_PORTIONS } from '../lib/listing'

export function TimeStatus({ listing, state, now }: { listing: Listing; state: ListingState; now: number }) {
  switch (state) {
    case 'upcoming':
      return <span className="status status--later">Starts {clock(listing.availableFrom)}</span>
    case 'soon':
      return <span className="status status--soon">Ends in {duration(listing.availableUntil - now)}</span>
    case 'live':
      return <span className="status status--live">Until {clock(listing.availableUntil)}</span>
    case 'ended':
      return <span className="status status--ended">Ended</span>
  }
}

export function PortionsLeft({ listing }: { listing: Listing }) {
  const n = listing.portionsLeft
  if (n <= 0) return <span className="portions portions--low">None left</span>
  if (n <= LOW_PORTIONS) return <span className="portions portions--low">Only {n} left</span>
  return <span className="portions">{n} left</span>
}

const PILL_TEXT: Record<ListingState, string> = {
  live: 'Live',
  soon: 'Ending soon',
  upcoming: 'Scheduled',
  ended: 'Ended',
}

export function StatePill({ state }: { state: ListingState }) {
  return <span className={`pill pill--${state}`}>{PILL_TEXT[state]}</span>
}
