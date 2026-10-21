export type Category = 'bakery' | 'meals' | 'produce' | 'grocery'
export type Dietary = 'vegetarian' | 'vegan' | 'gluten-free' | 'halal'
export type Allergen = 'gluten' | 'dairy' | 'eggs' | 'nuts' | 'soy' | 'sesame' | 'fish' | 'shellfish'

export interface Venue {
  id: string
  name: string
  kind: string
  address: string
  neighborhood: string
  lat: number
  lng: number
  /** The restaurant account that runs this venue. Sample venues have none. */
  ownerId: string | null
  verificationStatus: VerificationStatus
  /** Made by "Try the demo": its posts only show up for the account that made them. */
  isDemo: boolean
}

/** pending: nothing sent yet · submitted: waiting for review · verified · rejected: needs a fix */
export type VerificationStatus = 'pending' | 'submitted' | 'verified' | 'rejected'

export type Role = 'visitor' | 'restaurant'

export interface Profile {
  id: string
  role: Role
  displayName: string
  isAdmin: boolean
}

export interface Listing {
  id: string
  venueId: string
  title: string
  description: string
  category: Category
  dietary: Dietary[]
  allergens: Allergen[]
  portionsTotal: number
  portionsLeft: number
  postedAt: number
  availableFrom: number
  availableUntil: number
  pickupNote: string
  markedGone?: boolean
}

export interface Pickup {
  listingId: string
  portions: number
  at: number
}

export type ListingState = 'upcoming' | 'live' | 'soon' | 'ended'
