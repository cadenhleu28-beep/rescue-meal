export interface LatLng {
  lat: number
  lng: number
}

/** Where distances are measured from when we don't have the user's location. */
export const DEMO_CENTER: LatLng & { label: string } = {
  lat: 40.5600,
  lng: -74.3640,
  label: 'central Edison',
}

export function distanceMiles(a: LatLng, b: LatLng) {
  const R = 3958.8
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function formatMiles(mi: number) {
  if (mi < 0.1) return '< 0.1 mi'
  return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`
}

export function directionsUrl(p: LatLng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`
}
