import { useEffect, useState, type FormEvent } from 'react'
import { Clock, FileText, ShieldCheck, Upload, XCircle } from 'lucide-react'
import type { Venue } from '../types'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth'
import { useStore } from '../store'
import { ago, useNow } from '../lib/time'

const MAX_BYTES = 10 * 1024 * 1024
const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,application/pdf'

interface Submission {
  licenseNumber: string
  phone: string
  website: string
  documentPath: string
  submittedAt: number
  reviewNote: string
}

/** Shown on the dashboard until an admin has verified the business. */
export function VerifyBusiness({ venue }: { venue: Venue }) {
  const { userId } = useAuth()
  const { refreshVenues } = useStore()
  const now = useNow(60_000)
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('venue_verifications')
      .select('license_number, phone, website, document_path, submitted_at, review_note')
      .eq('venue_id', venue.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        setSubmission(
          data && {
            licenseNumber: data.license_number,
            phone: data.phone,
            website: data.website,
            documentPath: data.document_path,
            submittedAt: Date.parse(data.submitted_at),
            reviewNote: data.review_note,
          },
        )
        setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [venue.id, venue.verificationStatus])

  const status = venue.verificationStatus
  const showForm = status === 'pending' || status === 'rejected' || editing

  return (
    <main className="partner">
      <div className="partner-head">
        <div>
          <p className="partner-eyebrow">Your dashboard</p>
          <h1>{venue.name}</h1>
          <p className="partner-addr">
            {venue.address}, {venue.neighborhood}
          </p>
        </div>
      </div>

      <div className="verify-grid">
        <section className="panel">
          {status === 'submitted' && !editing && (
            <div className="verify-state">
              <Clock size={22} />
              <div>
                <h2>We’re reviewing your business</h2>
                <p>
                  You sent your details {submission ? ago(submission.submittedAt, now) : 'recently'}. You can post food as
                  soon as they’re approved. This page updates on its own.
                </p>
                {submission && (
                  <dl className="verify-summary">
                    <div>
                      <dt>License or permit</dt>
                      <dd>{submission.licenseNumber}</dd>
                    </div>
                    <div>
                      <dt>Phone</dt>
                      <dd>{submission.phone}</dd>
                    </div>
                    {submission.website && (
                      <div>
                        <dt>Website</dt>
                        <dd>{submission.website}</dd>
                      </div>
                    )}
                  </dl>
                )}
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
                  Change what you sent
                </button>
              </div>
            </div>
          )}

          {status === 'rejected' && submission?.reviewNote && (
            <div className="verify-rejected" role="alert">
              <XCircle size={18} />
              <p>
                <strong>We couldn’t verify your business yet.</strong> {submission.reviewNote} Fix it below and send it
                again.
              </p>
            </div>
          )}

          {showForm && loaded && userId && (
            <VerifyForm
              userId={userId}
              initial={submission}
              onCancel={status === 'submitted' ? () => setEditing(false) : undefined}
              onSubmitted={async () => {
                setEditing(false)
                await refreshVenues()
              }}
            />
          )}
        </section>

        <aside className="panel verify-why">
          <ShieldCheck size={22} />
          <h2>Why we verify</h2>
          <p>
            People trust that what they find on Rescue Meal comes from a real business that handles food safely. Before a
            business can post, we check that it’s licensed to serve or sell food.
          </p>
          <h3>What to send</h3>
          <ul>
            <li>Your business license, food service permit or health permit number</li>
            <li>A photo or PDF of that license or permit</li>
            <li>A phone number we can call to confirm</li>
          </ul>
          <p className="verify-private">
            Only you and the Rescue Meal team can see these details. They’re never shown on the map.
          </p>
        </aside>
      </div>
    </main>
  )
}

interface VerifyFormProps {
  userId: string
  initial: Submission | null
  onCancel?: () => void
  onSubmitted: () => Promise<void>
}

function VerifyForm({ userId, initial, onCancel, onSubmitted }: VerifyFormProps) {
  const [licenseNumber, setLicenseNumber] = useState(initial?.licenseNumber ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [website, setWebsite] = useState(initial?.website ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const errors = {
    licenseNumber: licenseNumber.trim().length >= 3 ? null : 'Add your license or permit number.',
    phone: phone.replace(/\D/g, '').length >= 7 ? null : 'Add a phone number we can call.',
    file:
      file && file.size > MAX_BYTES
        ? 'That file is over 10 MB. Try a smaller photo or PDF.'
        : file || initial?.documentPath
          ? null
          : 'Upload a photo or PDF of the license or permit.',
  }
  const showError = (key: keyof typeof errors) => (submitted ? errors[key] : null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (Object.values(errors).some(Boolean) || busy) return
    setBusy(true)
    setError(null)
    try {
      let documentPath = initial?.documentPath ?? ''
      if (file) {
        const safeName = file.name.replace(/[^\w.-]+/g, '_').slice(-80)
        documentPath = `${userId}/${Date.now()}-${safeName}`
        const { error: uploadError } = await supabase.storage
          .from('verification-docs')
          .upload(documentPath, file, { contentType: file.type, upsert: false })
        if (uploadError) throw new Error(uploadError.message)
      }
      const { error: rpcError } = await supabase.rpc('submit_verification', {
        p_license_number: licenseNumber.trim(),
        p_phone: phone.trim(),
        p_website: website.trim(),
        p_document_path: documentPath,
      })
      if (rpcError) throw new Error(rpcError.message)
      await onSubmitted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your details. Try again.')
    }
    setBusy(false)
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="panel-head">
        <h2>Verify your business</h2>
        <p>You can post food once we’ve checked these details.</p>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="license">
          License or permit number
        </label>
        <input
          id="license"
          className={`input${showError('licenseNumber') ? ' has-error' : ''}`}
          value={licenseNumber}
          maxLength={60}
          onChange={(e) => setLicenseNumber(e.target.value)}
        />
        {showError('licenseNumber') ? (
          <p className="field-error">{errors.licenseNumber}</p>
        ) : (
          <p className="field-hint">From your business license, food service permit or health permit.</p>
        )}
      </div>

      <div className="field-row">
        <div className="field">
          <label className="field-label" htmlFor="phone">
            Business phone
          </label>
          <input
            id="phone"
            className={`input${showError('phone') ? ' has-error' : ''}`}
            type="tel"
            autoComplete="tel"
            value={phone}
            maxLength={30}
            onChange={(e) => setPhone(e.target.value)}
          />
          {showError('phone') && <p className="field-error">{errors.phone}</p>}
        </div>
        <div className="field">
          <label className="field-label" htmlFor="website">
            Website <span className="optional">Optional</span>
          </label>
          <input
            id="website"
            className="input"
            type="url"
            autoComplete="url"
            placeholder="https://"
            value={website}
            maxLength={200}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <span className="field-label" id="doc-label">
          Photo or PDF of the license or permit
        </span>
        <label className={`file-drop${showError('file') ? ' has-error' : ''}`} aria-labelledby="doc-label">
          <input type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {file ? <FileText size={18} /> : <Upload size={18} />}
          <span>
            {file
              ? file.name
              : initial?.documentPath
                ? 'Your earlier file is on record. Choose a new one to replace it.'
                : 'Choose a file (JPG, PNG, HEIC or PDF, up to 10 MB)'}
          </span>
        </label>
        {showError('file') && <p className="field-error">{errors.file}</p>}
      </div>

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
          {busy ? 'Sending…' : 'Send for review'}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
