// Chair and Dean "Request history": requests I have already decided on.
// Click a row to see the details, evidence and full approval history.
import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import { DECISION_LABEL, STATUS_LABEL, formatDate } from '../../config/status'
import RequestDetails from '../../components/RequestDetails'
import EvidenceList from '../../components/EvidenceList'
import ApprovalTrail from '../../components/ApprovalTrail'

export default function ReviewHistoryPage() {
  const [rows, setRows] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getReviewHistory()
      .then((data) => setRows(data.history))
      .catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    if (!selectedId) return
    api.getRequest(selectedId)
      .then(setDetail)
      .catch((err) => setError(err.message))
  }, [selectedId])

  const showing = detail && detail.request.id === selectedId ? detail : null

  return (
    <div>
      <h1 className="page-title">Request history</h1>
      <p className="muted">Requests you have decided on. Select one to see the full record.</p>
      {error && <p className="error">{error}</p>}

      <table className="table">
        <thead>
          <tr><th>Request / course</th><th>Student ID</th><th>My decision</th><th>Date</th><th>Status now</th></tr>
        </thead>
        <tbody>
          {rows?.map((r) => (
            <tr
              key={r.id}
              className={`clickable ${r.id === selectedId ? 'row-selected' : ''}`}
              onClick={() => setSelectedId(r.id)}
            >
              <td><strong>{r.request_number}</strong><br /><span className="small">{r.course_code} · Section {r.section}</span></td>
              <td>{r.student_number}</td>
              <td>{DECISION_LABEL[r.my_decision]}</td>
              <td>{formatDate(r.my_decided_at)}</td>
              <td><span className={`status status-${r.status.toLowerCase()}`}>{STATUS_LABEL[r.status]}</span></td>
            </tr>
          ))}
          {rows && rows.length === 0 && (
            <tr><td colSpan="5" className="muted">You have not decided on any requests yet.</td></tr>
          )}
        </tbody>
      </table>

      {showing && (
        <div className="history-detail">
          <RequestDetails request={showing.request} />
          <EvidenceList requestId={showing.request.id} evidence={showing.evidence} />
          <ApprovalTrail status={showing.request.status} history={showing.history} />
        </div>
      )}
    </div>
  )
}
