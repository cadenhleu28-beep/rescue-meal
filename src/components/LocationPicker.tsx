import { useEffect, useMemo } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MapContainer, Marker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { Basemap } from './FoodMap'
import { LogoMark } from './Logo'
import type { LatLng } from '../lib/geo'

interface Props {
  value: LatLng | null
  fallbackCenter: LatLng
  onChange: (p: LatLng) => void
}

const PIN_HTML = renderToStaticMarkup(<LogoMark size={34} />)

function ClickToPlace({ onChange }: Pick<Props, 'onChange'>) {
  useMapEvents({ click: (e) => onChange({ lat: e.latlng.lat, lng: e.latlng.lng }) })
  return null
}

function FollowValue({ value }: Pick<Props, 'value'>) {
  const map = useMap()
  useEffect(() => {
    if (value && (map.getZoom() < 15 || !map.getBounds().pad(-0.15).contains([value.lat, value.lng]))) {
      map.flyTo([value.lat, value.lng], Math.max(map.getZoom(), 16), { duration: 0.6 })
    }
  }, [value, map])
  return null
}

/** A small map where a restaurant taps (or drags the pin) to mark where pickups happen. */
export function LocationPicker({ value, fallbackCenter, onChange }: Props) {
  const icon = useMemo(() => L.divIcon({ className: 'pick-pin', html: PIN_HTML, iconSize: [34, 34], iconAnchor: [17, 34] }), [])
  const center = value ?? fallbackCenter

  return (
    <div className="picker">
      <MapContainer center={[center.lat, center.lng]} zoom={value ? 16 : 13} scrollWheelZoom={false} className="picker-map">
        <Basemap />
        <ClickToPlace onChange={onChange} />
        <FollowValue value={value} />
        {value && (
          <Marker
            position={[value.lat, value.lng]}
            icon={icon}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const p = (e.target as L.Marker).getLatLng()
                onChange({ lat: p.lat, lng: p.lng })
              },
            }}
          />
        )}
      </MapContainer>
    </div>
  )
}

/** Look up an address with OpenStreetMap's free geocoder. Returns null when nothing matches. */
export async function geocode(query: string): Promise<LatLng | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) return null
  const hits = (await res.json()) as { lat: string; lon: string }[]
  return hits[0] ? { lat: Number(hits[0].lat), lng: Number(hits[0].lon) } : null
}
