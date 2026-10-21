import { useCallback, useEffect, useState } from 'react'
import { Check, ExternalLink, X } from 'lucide-react'
import type { VerificationStatus } from '../types'
import { supabase } from '../lib/supabase'
import { ago, useNow } from '../lib/time'

interface Row {
  venue_id: string
  venue_name: string
  venue_kind: string
  venue_address: string
  venue_neighborhood: string
  status: VerificationStatus
  owner_name: string
  owner_email: string
  license_number: string | null
  phone: string | null
  website: string | null
  document_path: string | null
  submitted_at: string | null
  reviewed_at: string | null
  review_note: string | null
}

const STATUS_LABEL: Record<VerificationStatus, string> = {
  pending: 'Nothing sent yet',
  submitted: 'Waiting for review',
  verified: 'Verified',
  rejected: 'Rejected',
}

const STATUS_PILL: Record<VerificationStatus, string> = {
  pending: 'pill--ended',
  submitted: 'pill--upcoming',
  verified: 'pill--live',
  rejected: 'pill--soon',
}

/** Admins review restaurant verification requests here. */
export default function AdminPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'queue' | 'all'>('queue')

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('list_verifications')
    if (error) setError(error.message)
    else setRows(data as Row[])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const queue = rows.filter((r) => r.status === 'submitted')
  const shown = tab === 'queue' ? queue : rows

  return (
    <main className="partner admin">
      <div className="partner-head">
        <div>
          <p className="partner-eyebrow">Admin</p>
          <h1>Restaurant verification</h1>
          <p className="partner-addr">Check each business is licensed to serve or sell food before it can post.</p>
        </div>
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'queue'} onClick={() => setTab('queue')}>
            To review <span>{queue.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'all'} onClick={() => setTab('all')}>
            All restaurants <span>{rows.length}</span>
          </button>
        </div>
      </div>

      {error && <p className="field-error">{error}</p>}
      {loading ? (
        <p className="partner-loading">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="panel admin-empty">
          {tab === 'queue' ? 'Nothing waiting for review.' : 'No restaurant accounts yet.'}
        </p>
      ) : (
        <ul className="admin-list">
          {shown.map((r) => (
            <ReviewCard key={r.venue_id} row={r} onReviewed={load} />
          ))}
        </ul>
      )}
    </main>
  )
}

function ReviewCard({ row, onReviewed }: { row: Row; onReviewed: () => Promise<void> }) {
  const now = useNow(60_000)
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const openDocument = async () => {
    if (!row.document_path) return
    // Open the tab synchronously so pop-up blockers allow it, then point it at a short-lived link.
    const tab = window.open('', '_blank')
    const { data, error } = await supabase.storage.from('verification-docs').createSignedUrl(row.document_path, 300)
    if (error || !data) {
      tab?.close()
      setError(error?.message ?? 'Could not open the document.')
      return
    }
    if (tab) tab.location.href = data.signedUrl
  }

  const review = async (approve: boolean) => {
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('review_venue', { p_venue: row.venue_id, p_approve: approve, p_note: note })
    if (error) {
      setError(error.message)
      setBusy(false)
      return
    }
    await onReviewed()
  }

  return (
    <li className="panel admin-card">
      <div className="admin-card-head">
        <div>
          <h2>{row.venue_name}</h2>
          <p className="partner-addr">
            {row.venue_kind} · {row.venue_address}
            {row.venue_neighborhood ? `, ${row.venue_neighborhood}` : ''}
          </p>
        </div>
        <span className={`pill ${STATUS_PILL[row.status]}`}>{STATUS_LABEL[row.status]}</span>
      </div>

      <dl className="verify-summary">
        <div>
          <dt>Account</dt>
          <dd>
            {row.owner_name} · {row.owner_email}
          </dd>
        </div>
        {row.license_number && (
          <div>
            <dt>License or permit</dt>
            <dd>{row.license_number}</dd>
          </div>
        )}
        {row.phone && (
          <div>
            <dt>Phone</dt>
            <dd>
              <a href={`tel:${row.phone}`}>{row.phone}</a>
            </dd>
          </div>
        )}
        {row.website && (
          <div>
            <dt>Website</dt>
            <dd>
              <a href={row.website.startsWith('http') ? row.website : `https://${row.website}`} target="_blank" rel="noreferrer">
                {row.website}
              </a>
            </dd>
          </div>
        )}
        {row.submitted_at && (
          <div>
            <dt>Sent</dt>
            <dd>{ago(Date.parse(row.submitted_at), now)}</dd>
          </div>
        )}
        {row.review_note && (
          <div>
            <dt>Last note</dt>
            <dd>{row.review_note}</dd>
          </div>
        )}
      </dl>

      {row.document_path && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={openDocument}>
          View document <ExternalLink size={14} />
        </button>
      )}

      {row.status === 'submitted' && (
        <div className="admin-actions">
          {rejecting ? (
            <>
              <label className="field-label" htmlFor={`note-${row.venue_id}`}>
                What should they fix?
              </label>
              <textarea
                id={`note-${row.venue_id}`}
                className="textarea"
                rows={2}
                placeholder="e.g. The permit photo is too blurry to read the number."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="form-actions">
                <button type="button" className="btn btn-primary" disabled={busy || !note.trim()} onClick={() => review(false)}>
                  Send back
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setRejecting(false)}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <div className="form-actions">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => review(true)}>
                <Check size={16} /> Approve
              </button>
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setRejecting(true)}>
                <X size={16} /> Reject
              </button>
            </div>
          )}
        </div>
      )}
      {error && <p className="field-error">{error}</p>}
    </li>
  )
}
