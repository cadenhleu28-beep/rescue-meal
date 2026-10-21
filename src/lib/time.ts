import { useEffect, useState } from 'react'

export const MINUTE = 60_000

export function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

export function clock(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/** "45 min", "1 hr 20 min" */
export function duration(ms: number) {
  const total = Math.max(1, Math.round(ms / MINUTE))
  if (total < 60) return `${total} min`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m ? `${h} hr ${m} min` : `${h} hr`
}

/** Compact form for map pins: "45m", "1h 20m" */
export function shortDuration(ms: number) {
  const total = Math.max(1, Math.round(ms / MINUTE))
  if (total < 60) return `${total}m`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

export function ago(ts: number, now: number) {
  const mins = Math.round((now - ts) / MINUTE)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} hr ago`
  const days = Math.round(hrs / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
}
