import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check, List, LocateFixed, Map as MapIcon, Search, X } from 'lucide-react'
import type { Category, Dietary, Listing, ListingState, Venue } from '../types'
import { CATEGORIES, CATEGORY_LABELS, DIETARY, DIETARY_LABELS } from '../data/labels'
import { DEMO_CENTER, distanceMiles, type LatLng } from '../lib/geo'
import { isActive, listingState } from '../lib/listing'
import { clock, shortDuration, useNow } from '../lib/time'
import { useStore } from '../store'
import { ListingCard } from '../components/ListingCard'
import { ListingDetail } from '../components/ListingDetail'
import { FoodMap, type MapItem, type PinVariant } from '../components/FoodMap'

type SortKey = 'ending' | 'nearest' | 'most'

const SORT_LABELS: Record<SortKey, string> = {
  ending: 'Ending soonest',
  nearest: 'Nearest',
  most: 'Most portions',
}

interface Result {
  listing: Listing
  venue: Venue
  state: ListingState
  miles: number
}

// Anything farther than this from the demo listings is treated as "outside the demo area".
const DEMO_RADIUS_MI = 40

export default function FindPage() {
  const { status, loadError, listings, venueById } = useStore()
  const now = useNow()
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('l')

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category | null>(null)
  const [dietary, setDietary] = useState<Dietary[]>([])
  const [openNow, setOpenNow] = useState(false)
  const [sort, setSort] = useState<SortKey>('ending')
  const [user, setUser] = useState<LatLng | null>(null)
  const [locating, setLocating] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'map'>('list')

  const origin = user ?? DEMO_CENTER

  const active = useMemo<Result[]>(() => {
    const out: Result[] = []
    for (const listing of listings) {
      const venue = venueById(listing.venueId)
      const state = listingState(listing, now)
      if (!venue || !isActive(state)) continue
      out.push({ listing, venue, state, miles: distanceMiles(origin, venue) })
    }
    return out
  }, [listings, venueById, now, origin])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = active.filter(({ listing, venue, state }) => {
      if (category && listing.category !== category) return false
      if (openNow && state === 'upcoming') return false
      if (!dietary.every((d) => listing.dietary.includes(d))) return false
      if (q) {
        const haystack = [listing.title, listing.description, venue.name, venue.kind, venue.neighborhood].join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
    return filtered.sort((a, b) => {
      if (sort === 'nearest') return a.miles - b.miles
      if (sort === 'most') return b.listing.portionsLeft - a.listing.portionsLeft
      // Ending soonest, with not-yet-started posts at the bottom.
      const aLater = a.state === 'upcoming' ? 1 : 0
      const bLater = b.state === 'upcoming' ? 1 : 0
      return aLater - bLater || a.listing.availableUntil - b.listing.availableUntil
    })
  }, [active, query, category, openNow, dietary, sort])

  const selected = active.find((r) => r.listing.id === selectedId) ?? null

  const mapItems = useMemo<MapItem[]>(() => {
    // Nudge pins that share a venue so they don't stack exactly on top of each other.
    const seen = new Map<string, number>()
    const shown = selected && !results.includes(selected) ? [...results, selected] : results
    return shown.map(({ listing, venue, state }) => {
      const n = seen.get(venue.id) ?? 0
      seen.set(venue.id, n + 1)
      const variant: PinVariant = state === 'upcoming' ? 'later' : state === 'soon' ? 'soon' : 'live'
      const label = state === 'upcoming' ? clock(listing.availableFrom) : shortDuration(listing.availableUntil - now)
      return {
        id: listing.id,
        name: venue.name,
        lat: venue.lat - n * 0.0004,
        lng: venue.lng + n * 0.0006,
        label,
        variant,
        category: listing.category,
      }
    })
  }, [results, selected, now])

  const select = (id: string | null) => {
    setParams(id ? { l: id } : {}, { replace: !!selectedId && !!id })
  }

  const toggleDietary = (d: Dietary) =>
    setDietary((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))

  const clearFilters = () => {
    setQuery('')
    setCategory(null)
    setDietary([])
    setOpenNow(false)
  }

  const locate = () => {
    if (!('geolocation' in navigator)) {
      setNotice(`Your browser doesn't share location, so distances are measured from ${DEMO_CENTER.label}.`)
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        if (distanceMiles(here, DEMO_CENTER) > DEMO_RADIUS_MI) {
          setNotice(`You're outside the demo area. These sample listings are in Edison, NJ, so distances are measured from ${DEMO_CENTER.label}.`)
          return
        }
        setNotice(null)
        setUser(here)
        setSort('nearest')
      },
      () => {
        setLocating(false)
        setNotice(`We couldn't get your location. Distances are measured from ${DEMO_CENTER.label}.`)
      },
      { enableHighAccuracy: false, timeout: 10_000 },
    )
  }

  const hasFilters = !!(query || category || dietary.length || openNow)

  return (
    <div className={`find view-${mobileView}`}>
      <aside className="sidebar" aria-label="Listings">
        <div className="sidebar-list">
          <div className="filters">
            <label className="search">
              <Search size={17} aria-hidden="true" />
              <input
                type="search"
                placeholder="Search food or places"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search food or places"
              />
              {query && (
                <button type="button" className="search-clear" onClick={() => setQuery('')} aria-label="Clear search">
                  <X size={15} />
                </button>
              )}
            </label>

            <div className="chip-row" role="group" aria-label="Category">
              <button type="button" className={`chip${category === null ? ' is-on' : ''}`} onClick={() => setCategory(null)}>
                All food
              </button>
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`chip${category === c ? ' is-on' : ''}`}
                  onClick={() => setCategory(category === c ? null : c)}
                >
                  {CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>

            <div className="chip-row" role="group" aria-label="More filters">
              <button
                type="button"
                className={`chip chip--outline${openNow ? ' is-checked' : ''}`}
                aria-pressed={openNow}
                onClick={() => setOpenNow(!openNow)}
              >
                {openNow && <Check size={14} strokeWidth={2.6} />}
                Available now
              </button>
              {DIETARY.map((d) => {
                const on = dietary.includes(d)
                return (
                  <button
                    key={d}
                    type="button"
                    className={`chip chip--outline${on ? ' is-checked' : ''}`}
                    aria-pressed={on}
                    onClick={() => toggleDietary(d)}
                  >
                    {on && <Check size={14} strokeWidth={2.6} />}
                    {DIETARY_LABELS[d]}
                  </button>
                )
              })}
            </div>
          </div>

          {notice && (
            <div className="notice" role="status">
              <p>{notice}</p>
              <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
                <X size={15} />
              </button>
            </div>
          )}

          <div className="results-head">
            <p>
              {status === 'ready' && (
                <>
                  <strong>{results.length}</strong> {results.length === 1 ? 'listing' : 'listings'}{' '}
                </>
              )}
              near {user ? 'you' : DEMO_CENTER.label}
            </p>
            <label className="sort">
              <span className="visually-hidden">Sort by</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                  <option key={k} value={k}>
                    {SORT_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {status !== 'ready' ? (
            <div className="empty">
              {status === 'loading' ? (
                <p>Loading listings…</p>
              ) : (
                <>
                  <h2>Couldn't load listings</h2>
                  <p>{loadError}</p>
                </>
              )}
            </div>
          ) : results.length > 0 ? (
            <ul className="results">
              {results.map((r) => (
                <li key={r.listing.id}>
                  <ListingCard
                    listing={r.listing}
                    venue={r.venue}
                    state={r.state}
                    now={now}
                    miles={r.miles}
                    selected={r.listing.id === selectedId}
                    onSelect={() => select(r.listing.id)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">
              <h2>Nothing matches right now</h2>
              <p>
                {hasFilters
                  ? 'Try removing a filter. New food usually gets posted around closing time.'
                  : 'No food is posted nearby at the moment. Check back around closing time.'}
              </p>
              {hasFilters && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </div>
          )}

          <p className="sidebar-foot">
            Sample listings for the demo. <Link to="/how-it-works">How Rescue Meal works</Link>
          </p>
        </div>

        {selected && (
          <div className="sidebar-detail" key={selected.listing.id}>
            <ListingDetail
              listing={selected.listing}
              venue={selected.venue}
              state={selected.state}
              miles={selected.miles}
              now={now}
              onBack={() => select(null)}
              onShowMap={() => setMobileView('map')}
            />
          </div>
        )}
      </aside>

      <section className="map-pane" aria-label="Map">
        <FoodMap items={mapItems} selectedId={selectedId} onSelect={select} user={user} fallbackCenter={DEMO_CENTER} />

        <button type="button" className="btn btn-secondary map-locate" onClick={locate} disabled={locating}>
          <LocateFixed size={16} />
          {locating ? 'Locating…' : 'Near me'}
        </button>

        <div className="map-legend" aria-hidden="true">
          <span>
            <i className="dot dot--live" />
            Available
          </span>
          <span>
            <i className="dot dot--soon" />
            Ends within 30 min
          </span>
          <span>
            <i className="dot dot--later" />
            Starts later
          </span>
        </div>

        {selected && mobileView === 'map' && (
          <div className="map-preview">
            <ListingCard
              listing={selected.listing}
              venue={selected.venue}
              state={selected.state}
              now={now}
              miles={selected.miles}
              onSelect={() => setMobileView('list')}
            />
          </div>
        )}
      </section>

      <button
        type="button"
        className="view-toggle"
        onClick={() => setMobileView(mobileView === 'list' ? 'map' : 'list')}
      >
        {mobileView === 'list' ? (
          <>
            <MapIcon size={16} /> Map
          </>
        ) : (
          <>
            <List size={16} /> List
          </>
        )}
      </button>
    </div>
  )
}
