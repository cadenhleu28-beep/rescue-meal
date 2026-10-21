import type { Listing, ListingState, Venue } from '../types'
import { DIETARY_LABELS } from '../data/labels'
import { formatMiles } from '../lib/geo'
import { CategoryTile } from './CategoryIcon'
import { PortionsLeft, TimeStatus } from './Status'

interface Props {
  listing: Listing
  venue: Venue
  state: ListingState
  now: number
  miles?: number
  selected?: boolean
  onSelect?: () => void
}

export function ListingCard({ listing, venue, state, now, miles, selected, onSelect }: Props) {
  const body = (
    <>
      <CategoryTile category={listing.category} />
      <span className="card-body">
        <span className="card-top">
          <span className="card-venue">{venue.name}</span>
          {miles !== undefined && <span className="card-dist">{formatMiles(miles)}</span>}
        </span>
        <span className="card-title">{listing.title || 'Untitled post'}</span>
        <span className="card-meta">
          <TimeStatus listing={listing} state={state} now={now} />
          <PortionsLeft listing={listing} />
        </span>
        {listing.dietary.length > 0 && (
          <span className="card-tags">
            {listing.dietary.map((d) => (
              <span key={d} className="tag">
                {DIETARY_LABELS[d]}
              </span>
            ))}
          </span>
        )}
      </span>
    </>
  )

  if (!onSelect) return <div className="card card--static">{body}</div>

  return (
    <button type="button" className={`card${selected ? ' is-selected' : ''}`} onClick={onSelect} aria-pressed={selected}>
      {body}
    </button>
  )
}
