import { useEffect, useMemo, useRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CircleMarker, MapContainer, Marker, Tooltip, ZoomControl, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@maplibre/maplibre-gl-leaflet'
import type { Category } from '../types'
import type { LatLng } from '../lib/geo'
import { CATEGORY_ICONS } from './CategoryIcon'

export type PinVariant = 'live' | 'soon' | 'later'

export interface MapItem extends LatLng {
  id: string
  name: string
  label: string
  variant: PinVariant
  category: Category
}

interface Props {
  items: MapItem[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  user: LatLng | null
  fallbackCenter: LatLng
}

const ICON_SVG = Object.fromEntries(
  Object.entries(CATEGORY_ICONS).map(([cat, Icon]) => [cat, renderToStaticMarkup(<Icon size={14} strokeWidth={2.2} />)]),
) as Record<Category, string>

function Pin({ item, selected, onSelect }: { item: MapItem; selected: boolean; onSelect: (id: string) => void }) {
  const icon = useMemo(
    () =>
      L.divIcon({
        className: 'pin-anchor',
        iconSize: [0, 0],
        html: `<div class="pin pin--${item.variant}${selected ? ' is-selected' : ''}">${ICON_SVG[item.category]}<span>${item.label}</span></div>`,
      }),
    [item.variant, item.label, item.category, selected],
  )

  return (
    <Marker
      position={[item.lat, item.lng]}
      icon={icon}
      zIndexOffset={selected ? 1000 : item.variant === 'soon' ? 200 : 0}
      eventHandlers={{ click: () => onSelect(item.id) }}
    >
      {!selected && (
        <Tooltip direction="top" offset={[0, -16]} opacity={1} className="pin-tip">
          {item.name}
        </Tooltip>
      )}
    </Marker>
  )
}

// OpenFreeMap: free vector tiles, no API key or account needed.
const BASEMAP_STYLE = 'https://tiles.openfreemap.org/styles/positron'
const BASEMAP_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>'

export function Basemap() {
  const map = useMap()
  useEffect(() => {
    const layer = L.maplibreGL({ style: BASEMAP_STYLE, attributionControl: false })
    layer.getAttribution = () => BASEMAP_ATTRIBUTION
    layer.addTo(map)
    layer.getMaplibreMap().on('error', (e) => console.error('[basemap]', e.error?.message))
    return () => {
      layer.remove()
    }
  }, [map])
  return null
}

/** Keeps the map in sync with selection and user location without fighting the user's own panning. */
function Controller({ items, selectedId, user, onSelect }: Pick<Props, 'items' | 'selectedId' | 'user' | 'onSelect'>) {
  const map = useMap()
  const fitted = useRef(false)

  useMapEvents({ click: () => onSelect(null) })

  // The map container changes size when the mobile list/map toggle flips.
  useEffect(() => {
    const el = map.getContainer()
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(el)
    return () => ro.disconnect()
  }, [map])

  useEffect(() => {
    if (fitted.current || items.length === 0) return
    fitted.current = true
    map.fitBounds(L.latLngBounds(items.map((i) => [i.lat, i.lng])), { padding: [48, 48], maxZoom: 15 })
  }, [items, map])

  useEffect(() => {
    if (!selectedId) return
    const item = items.find((i) => i.id === selectedId)
    if (!item) return
    const inView = map.getBounds().pad(-0.2).contains([item.lat, item.lng])
    if (!inView) map.flyTo([item.lat, item.lng], Math.max(map.getZoom(), 14), { duration: 0.6 })
    // Only react to selection changes, not to every list re-filter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, map])

  useEffect(() => {
    if (user) map.flyTo([user.lat, user.lng], 15, { duration: 0.8 })
  }, [user, map])

  return null
}

export function FoodMap({ items, selectedId, onSelect, user, fallbackCenter }: Props) {
  return (
    <MapContainer
      className="map"
      center={[fallbackCenter.lat, fallbackCenter.lng]}
      zoom={13}
      zoomControl={false}
      minZoom={11}
      maxZoom={18}
      scrollWheelZoom
    >
      <Basemap />
      <ZoomControl position="bottomright" />
      {user && (
        <>
          <CircleMarker center={[user.lat, user.lng]} radius={18} pathOptions={{ stroke: false, fillColor: '#2F6FEB', fillOpacity: 0.15 }} />
          <CircleMarker center={[user.lat, user.lng]} radius={7} pathOptions={{ color: '#fff', weight: 3, fillColor: '#2F6FEB', fillOpacity: 1 }} />
        </>
      )}
      {items.map((item) => (
        <Pin key={item.id} item={item} selected={item.id === selectedId} onSelect={onSelect} />
      ))}
      <Controller items={items} selectedId={selectedId} user={user} onSelect={onSelect} />
    </MapContainer>
  )
}
