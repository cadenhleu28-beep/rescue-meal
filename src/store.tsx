import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Allergen, Category, Dietary, Hold, Listing, Pickup, Venue, VerificationStatus } from './types'
import { supabase } from './lib/supabase'
import { useAuth } from './auth'

// All data lives in Supabase (see supabase/migrations) and is only readable when signed in.
// Every change goes through a database function that checks the rules, and listings and venues
// stream updates to everyone in real time.

interface ListingRow {
  id: string
  venue_id: string
  title: string
  description: string
  category: Category
  dietary: Dietary[]
  allergens: Allergen[]
  portions_total: number
  portions_left: number
  posted_at: string
  available_from: string
  available_until: string
  pickup_note: string
  reservable: boolean
  marked_gone: boolean
}

interface VenueRow {
  id: string
  name: string
  kind: string
  address: string
  neighborhood: string
  lat: number
  lng: number
  owner_id: string | null
  verification_status: VerificationStatus
  is_demo?: boolean
}

interface HoldRow {
  listing_id: string
  code: string
  until: string
}

interface PickupRow {
  listing_id: string
  portions: number
  taken_at: string
}

const toListing = (r: ListingRow): Listing => ({
  id: r.id,
  venueId: r.venue_id,
  title: r.title,
  description: r.description,
  category: r.category,
  dietary: r.dietary,
  allergens: r.allergens,
  portionsTotal: r.portions_total,
  portionsLeft: r.portions_left,
  postedAt: Date.parse(r.posted_at),
  availableFrom: Date.parse(r.available_from),
  availableUntil: Date.parse(r.available_until),
  pickupNote: r.pickup_note,
  reservable: r.reservable,
  markedGone: r.marked_gone,
})

const toVenue = (r: VenueRow): Venue => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  address: r.address,
  neighborhood: r.neighborhood,
  lat: r.lat,
  lng: r.lng,
  ownerId: r.owner_id,
  verificationStatus: r.verification_status,
  isDemo: r.is_demo ?? false,
})

const toHold = (r: HoldRow): Hold => ({ listingId: r.listing_id, code: r.code, until: Date.parse(r.until) })
const toPickup = (r: PickupRow): Pickup => ({ listingId: r.listing_id, portions: r.portions, at: Date.parse(r.taken_at) })

const byListing = <T extends { listingId: string }>(items: T[]) => Object.fromEntries(items.map((x) => [x.listingId, x]))

function upsert<T extends { id: string }>(items: T[], next: T) {
  return items.some((x) => x.id === next.id) ? items.map((x) => (x.id === next.id ? next : x)) : [next, ...items]
}

function check<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  return data
}

export type NewListing = Omit<Listing, 'id' | 'venueId' | 'postedAt' | 'portionsLeft' | 'markedGone'>

interface StoreValue {
  status: 'loading' | 'ready' | 'error'
  loadError: string | null
  venues: Venue[]
  venueById: (id: string) => Venue | undefined
  listings: Listing[]
  holds: Record<string, Hold>
  pickups: Record<string, Pickup>
  addListing: (input: NewListing) => Promise<Listing>
  extendListing: (id: string, minutes: number) => Promise<void>
  markGone: (id: string) => Promise<void>
  reserve: (id: string) => Promise<void>
  cancelHold: (id: string) => Promise<void>
  pickUp: (id: string, portions: number) => Promise<void>
  undoPickUp: (id: string) => Promise<void>
  refreshVenues: () => Promise<void>
}

const StoreContext = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth()
  const [status, setStatus] = useState<StoreValue['status']>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [venues, setVenues] = useState<Venue[]>([])
  const [listings, setListings] = useState<Listing[]>([])
  const [holds, setHolds] = useState<Record<string, Hold>>({})
  const [pickups, setPickups] = useState<Record<string, Pickup>>({})

  // Everything is scoped to the signed-in user: nothing loads until someone logs in.
  useEffect(() => {
    let cancelled = false
    setHolds({})
    setPickups({})
    if (!userId) {
      setVenues([])
      setListings([])
      setStatus('ready')
      return
    }
    setStatus('loading')

    const channel = supabase
      .channel(`live-${userId}`)
      .on<ListingRow>('postgres_changes', { event: '*', schema: 'public', table: 'listings' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as Partial<ListingRow>).id
          setListings((ls) => ls.filter((l) => l.id !== id))
        } else {
          setListings((ls) => upsert(ls, toListing(payload.new)))
        }
      })
      .on<VenueRow>('postgres_changes', { event: '*', schema: 'public', table: 'venues' }, (payload) => {
        if (payload.eventType !== 'DELETE') setVenues((vs) => upsert(vs, toVenue(payload.new)))
      })
      .subscribe()

    ;(async () => {
      try {
        check(await supabase.rpc('refresh_demo'))
        const [v, l, h, p] = await Promise.all([
          supabase.from('venues').select('*'),
          supabase.from('listings').select('*').order('posted_at', { ascending: false }),
          supabase.from('holds').select('listing_id, code, until'),
          supabase.from('pickups').select('listing_id, portions, taken_at'),
        ])
        if (cancelled) return
        setVenues((check(v) as VenueRow[]).map(toVenue))
        setListings((check(l) as ListingRow[]).map(toListing))
        setHolds(byListing((check(h) as HoldRow[]).map(toHold)))
        setPickups(byListing((check(p) as PickupRow[]).map(toPickup)))
        setStatus('ready')
      } catch (e) {
        if (cancelled) return
        setLoadError(e instanceof Error ? e.message : String(e))
        setStatus('error')
      }
    })()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [userId])

  const refreshVenues = useCallback(async () => {
    const rows = check(await supabase.from('venues').select('*')) as VenueRow[]
    setVenues(rows.map(toVenue))
  }, [])

  const venueById = useCallback((id: string) => venues.find((v) => v.id === id), [venues])

  // Re-read one listing after an action so the count updates even if the live feed is slow.
  const refreshListing = useCallback(async (id: string) => {
    const row = check(await supabase.from('listings').select('*').eq('id', id).single()) as ListingRow
    setListings((ls) => upsert(ls, toListing(row)))
  }, [])

  const addListing = useCallback(async (input: NewListing) => {
    const row = check(
      await supabase.rpc('post_listing', {
        p_title: input.title,
        p_description: input.description,
        p_category: input.category,
        p_dietary: input.dietary,
        p_allergens: input.allergens,
        p_portions: input.portionsTotal,
        p_available_from: new Date(input.availableFrom).toISOString(),
        p_available_until: new Date(input.availableUntil).toISOString(),
        p_pickup_note: input.pickupNote,
        p_reservable: input.reservable,
      }),
    ) as ListingRow
    const listing = toListing(row)
    setListings((ls) => upsert(ls, listing))
    return listing
  }, [])

  const extendListing = useCallback(async (id: string, minutes: number) => {
    const row = check(await supabase.rpc('extend_listing', { p_listing: id, p_minutes: minutes })) as ListingRow
    setListings((ls) => upsert(ls, toListing(row)))
  }, [])

  const markGone = useCallback(async (id: string) => {
    const row = check(await supabase.rpc('mark_gone', { p_listing: id })) as ListingRow
    setListings((ls) => upsert(ls, toListing(row)))
  }, [])

  const reserve = useCallback(
    async (id: string) => {
      const hold = toHold(check(await supabase.rpc('reserve', { p_listing: id })) as HoldRow)
      setHolds((hs) => ({ ...hs, [id]: hold }))
      await refreshListing(id)
    },
    [refreshListing],
  )

  const cancelHold = useCallback(
    async (id: string) => {
      check(await supabase.rpc('cancel_hold', { p_listing: id }))
      setHolds(({ [id]: _removed, ...rest }) => rest)
      await refreshListing(id)
    },
    [refreshListing],
  )

  const pickUp = useCallback(
    async (id: string, portions: number) => {
      const pickup = toPickup(check(await supabase.rpc('take_portions', { p_listing: id, p_portions: portions })) as PickupRow)
      setPickups((ps) => ({ ...ps, [id]: pickup }))
      setHolds(({ [id]: _removed, ...rest }) => rest)
      await refreshListing(id)
    },
    [refreshListing],
  )

  const undoPickUp = useCallback(
    async (id: string) => {
      check(await supabase.rpc('undo_pickup', { p_listing: id }))
      setPickups(({ [id]: _removed, ...rest }) => rest)
      await refreshListing(id)
    },
    [refreshListing],
  )

  const value = useMemo<StoreValue>(
    () => ({
      status,
      loadError,
      venues,
      venueById,
      listings,
      holds,
      pickups,
      addListing,
      extendListing,
      markGone,
      reserve,
      cancelHold,
      pickUp,
      undoPickUp,
      refreshVenues,
    }),
    [status, loadError, venues, venueById, listings, holds, pickups, addListing, extendListing, markGone, reserve, cancelHold, pickUp, undoPickUp, refreshVenues],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>')
  return ctx
}
