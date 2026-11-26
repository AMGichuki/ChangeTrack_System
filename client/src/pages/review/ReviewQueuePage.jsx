// Approver screen: Chair and Dean "Review grade change requests" (wireframe pages 5, 6)
// and Registrar "Verify & post grade changes" (wireframe page 7).
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../../services/api'
import { useAuth } from '../../context/useAuth'
import RequestDetails from '../../components/RequestDetails'
import EvidenceList from '../../components/EvidenceList'
import ApprovalTrail from '../../components/ApprovalTrail'

const ROLE_TEXT = {
  CHAIR: {
    title: 'Review grade change requests',
    queueLabel: 'Awaiting your review',
    subtitle: 'Your department only · Lecturer-verified requests awaiting your decision.',
    approveLabel: 'Approve → Dean',
    nextLabel: 'the Dean',
  },
  DEAN: {
    title: 'Review grade change requests',
    queueLabel: 'Awaiting your review',
    subtitle: 'Only requests approved by the Chair appear in this queue.',
    approveLabel: 'Approve → Registrar',
    nextLabel: 'the Registrar',
  },
  REGISTRAR: {
    title: 'Verify & post grade changes',
    queueLabel: 'Ready to post',
    subtitle: 'Chair- and Dean-approved requests · Enter grades in the existing grading system first.',
  },
}

// Registrar's right-hand panel: post in the grading system, or report an issue.
function RegistrarPanel({ request, verified, setVerified, comment, setComment, busy, decide }) {
  const [pdfError, setPdfError] = useState('')

  async function downloadPdf() {
    setPdfError('')
    try {
      await api.downloadPdf(request.id, request.request_number)
    } catch (err) {
      setPdfError(err.message)
    }
  }

  return (
    <aside>
      <section className="panel">
        <h2 className="panel-title">Post in the grading system</h2>
        <ol className="small muted steps">
          <li>Verify the approved grade below.</li>
          <li>Enter it in the existing grading system.</li>
          <li>Return here and confirm posting.</li>
        </ol>
        <p className="post-box">{request.student_number} · {request.course_code} → {request.new_grade}</p>
        <label className="checkbox">
          <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} />
          I verified and entered the grade.
        </label>
        <div className="decision-buttons">
          <button type="button" className="btn-yellow" disabled={busy || !verified} onClick={() => decide('POST')}>
            Mark as posted
          </button>
          <button type="button" className="btn-outline" onClick={downloadPdf}>Download PDF form</button>
        </div>
        {pdfError && <p className="error">{pdfError}</p>}
        <p className="small muted">Marking as posted records your verification. It does not update grades automatically.</p>
      </section>

      <section className="panel">
        <label className="field">
          <span>Issue found? A comment is required.</span>
          <textarea rows={3} maxLength={1000} placeholder="Explain the issue to the lecturer."
            value={comment} onChange={(e) => setComment(e.target.value)} />
        </label>
        <div className="decision-row">
          <button type="button" className="btn-cream" disabled={busy} onClick={() => decide('RETURN')}>
            Return for correction
          </button>
          <button type="button" className="btn-outline" disabled={busy} onClick={() => decide('REJECT')}>
            Reject &amp; close
          </button>
        </div>
      </section>
    </aside>
  )
}

function daysText(n) {
  if (n === 0) return 'today'
  return `${n} working ${n === 1 ? 'day' : 'days'}`
}

export default function ReviewQueuePage() {
  const { user } = useAuth()
  // On /acting/:approverId this person works the queue of the approver they act for.
  const { approverId } = useParams()
  const acting = approverId ? (user.acting || []).find((a) => a.approver_id === Number(approverId)) : null
  const role = acting ? acting.role : user.role
  const actingFor = acting ? acting.approver_id : null
  const text = ROLE_TEXT[role]

  const [queue, setQueue] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [comment, setComment] = useState('')
  const [verified, setVerified] = useState(false) // Registrar: "I verified and entered the grade"
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('') // message after a decision

  // Load the queue. Keeps the current selection if it is still there,
  // otherwise selects the oldest waiting request.
  const loadQueue = useCallback(() => {
    return api.getReviewQueue(actingFor)
      .then((data) => {
        setQueue(data.queue)
        setSelectedId((current) =>
          data.queue.some((q) => q.id === current) ? current : data.queue[0]?.id ?? null)
      })
      .catch((err) => setError(err.message))
  }, [actingFor])

  useEffect(() => { loadQueue() }, [loadQueue])

  // Load the details of the selected request.
  useEffect(() => {
    if (!selectedId) return
    api.getRequest(selectedId)
      .then(setDetail)
      .catch((err) => setError(err.message))
  }, [selectedId])

  function select(id) {
    setSelectedId(id)
    setComment('')
    setVerified(false)
    setError('')
    setDone('')
  }

  async function decide(decision) {
    setError('')
    setDone('')
    const needsComment = decision === 'RETURN' || decision === 'REJECT'
    if (needsComment && comment.trim().length < 5) {
      return setError('Write a comment (at least 5 characters) explaining why.')
    }
    const questions = {
      APPROVE: `Approve ${detail.request.request_number} and send it to ${text.nextLabel}?`,
      POST: `Mark ${detail.request.request_number} as posted? Only do this after entering the new grade in the school's grading system.`,
      RETURN: `Return ${detail.request.request_number} to the lecturer for correction?`,
      REJECT: `Reject ${detail.request.request_number}? This closes the request for good.`,
    }
    if (!window.confirm(questions[decision])) return

    setBusy(true)
    try {
      await api.decide(detail.request.id, decision, comment, verified, actingFor)
      const results = {
        APPROVE: `was approved and sent to ${text.nextLabel}. They have been emailed.`,
        POST: 'was marked as posted. The lecturer and the student have been emailed.',
        RETURN: 'was returned to the lecturer, who has been emailed your comment.',
        REJECT: 'was rejected and closed. The lecturer has been emailed your comment.',
      }
      setDone(`${detail.request.request_number} ${results[decision]}`)
      setComment('')
      setVerified(false)
      setDetail(null)
      await loadQueue()
    } catch (err) {
      setError(err.message)
      if (err.status === 409) loadQueue() // someone else decided: refresh
    } finally {
      setBusy(false)
    }
  }

  const showing = detail && detail.request.id === selectedId ? detail : null

  if (approverId && !acting) {
    return <p className="error">You are not acting for this approver today. The Admin may have ended the delegation.</p>
  }

  return (
    <div>
      <h1 className="page-title">{text.title}</h1>
      <p className="muted">{text.subtitle}</p>
      {acting && (
        <div className="notice acting-banner" role="status">
          <p>You are <strong>acting as {acting.role === 'CHAIR' ? 'Chair' : acting.role === 'DEAN' ? 'Dean' : 'Registrar'} for {acting.approver_name}</strong>, as set by the Admin.
          Your decisions are recorded under your own name, &ldquo;acting for {acting.approver_name}&rdquo;.</p>
        </div>
      )}

      {done && <div className="notice notice-success" role="status"><p>{done}</p></div>}

      <section className="panel queue-bar">
        <h2 className="panel-title">{text.queueLabel} · {queue ? queue.length : '…'}</h2>
        {queue && queue.length === 0 && <p className="muted small">Nothing is waiting for your review right now.</p>}
        <div className="queue-chips">
          {queue?.map((q) => (
            <button
              key={q.id}
              type="button"
              className={`queue-chip ${q.id === selectedId ? 'active' : ''}`}
              onClick={() => select(q.id)}
            >
              <strong>{q.request_number}</strong> · {q.course_code} · {daysText(q.working_days)}
            </button>
          ))}
        </div>
      </section>

      {error && <p className="error" role="alert">{error}</p>}

      {showing && (
        <>
          <div className="review-columns">
            <div>
              <RequestDetails request={showing.request} />
              <EvidenceList requestId={showing.request.id} evidence={showing.evidence} />
            </div>

            {role === 'REGISTRAR' ? (
              <RegistrarPanel
                request={showing.request}
                verified={verified}
                setVerified={setVerified}
                comment={comment}
                setComment={setComment}
                busy={busy}
                decide={decide}
              />
            ) : (
              <aside>
                <section className="panel">
                  <h2 className="panel-title">Your decision</h2>
                  <p className="small muted">Review the request and private evidence before approving.</p>
                  <label className="field">
                    <span>Comment</span>
                    <textarea
                      rows={4}
                      maxLength={1000}
                      placeholder="Required when returning for correction or rejecting."
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                    />
                  </label>
                  <div className="decision-buttons">
                    <button type="button" className="btn-blue" disabled={busy} onClick={() => decide('APPROVE')}>
                      {text.approveLabel}
                    </button>
                    <button type="button" className="btn-cream" disabled={busy} onClick={() => decide('RETURN')}>
                      Return for correction
                    </button>
                    <button type="button" className="btn-outline" disabled={busy} onClick={() => decide('REJECT')}>
                      Reject &amp; close
                    </button>
                  </div>
                </section>
                <p className="small muted">
                  You cannot approve your own request.<br />
                  The next approver is emailed after approval.
                </p>
              </aside>
            )}
          </div>

          <ApprovalTrail status={showing.request.status} history={showing.history} />
        </>
      )}
    </div>
  )
}
