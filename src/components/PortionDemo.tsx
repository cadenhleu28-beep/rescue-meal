import { useEffect, useRef, useState } from 'react'
import { Check, Minus, Plus, Users } from 'lucide-react'

const TOTAL = 20
const START = 12
const TAKEN = 2

type Phase = 'idle' | 'picking' | 'done'

/**
 * A scripted run of the "I took some" flow: someone picks 2 portions, confirms, and the
 * count drops. Plays once when scrolled into view; reduced-motion users see the end state.
 */
export function PortionDemo() {
  const ref = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [runs, setRuns] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPhase('done')
      return
    }
    const timers: number[] = []
    const play = () => {
      setPhase('idle')
      timers.push(window.setTimeout(() => setPhase('picking'), 900))
      timers.push(window.setTimeout(() => setPhase('done'), 2000))
    }
    if (runs > 0) {
      play()
      return () => timers.forEach(clearTimeout)
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          io.disconnect()
          play()
        }
      },
      { threshold: 0.6 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      timers.forEach(clearTimeout)
    }
  }, [runs])

  const picked = phase === 'idle' ? 1 : TAKEN
  const left = phase === 'done' ? START - TAKEN : START

  return (
    <div className="demo-ui" ref={ref}>
      <section className="stat demo-stat">
        <h3 className="stat-label">
          <Users size={14} /> Portions
        </h3>
        <p className="stat-value" aria-live="polite">
          {left} <span className="stat-of">of {TOTAL} left</span>
        </p>
        <div className="bar" aria-hidden="true">
          <i style={{ width: `${(left / TOTAL) * 100}%` }} />
        </div>
      </section>

      {phase === 'done' ? (
        <div className="hold demo-result">
          <div className="hold-head">
            <Check size={18} strokeWidth={2.5} />
            <span>
              You took <strong>{TAKEN} portions</strong>
            </span>
          </div>
          <p>Everyone’s map now shows {START - TAKEN} left.</p>
          <button type="button" className="link-btn demo-replay" onClick={() => setRuns((n) => n + 1)}>
            Play again
          </button>
        </div>
      ) : (
        <div className="take" aria-hidden="true">
          <p className="take-label">How many portions did you take?</p>
          <div className="take-row">
            <div className="stepper">
              <button type="button" tabIndex={-1}>
                <Minus size={16} />
              </button>
              <input type="number" value={picked} readOnly tabIndex={-1} />
              <button type="button" tabIndex={-1} className={phase === 'picking' ? 'is-pressed' : ''}>
                <Plus size={16} />
              </button>
            </div>
            <span className="take-of">of {START} left</span>
          </div>
          <div className="hold-actions">
            <span className="btn btn-primary">Confirm</span>
          </div>
        </div>
      )}
    </div>
  )
}
