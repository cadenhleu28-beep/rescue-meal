import type { Listing, ListingState } from '../types'
import { MINUTE } from './time'

export const ENDING_SOON_MS = 30 * MINUTE
export const LOW_PORTIONS = 5

export function listingState(l: Listing, now: number): ListingState {
  if (l.markedGone || l.portionsLeft <= 0 || now >= l.availableUntil) return 'ended'
  if (now < l.availableFrom) return 'upcoming'
  if (l.availableUntil - now <= ENDING_SOON_MS) return 'soon'
  return 'live'
}

export function isActive(state: ListingState) {
  return state !== 'ended'
}
