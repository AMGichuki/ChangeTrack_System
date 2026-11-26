// Lecturer view of one of their requests: details, evidence and where it is in the chain.
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../services/api'
import { STATUS_LABEL } from '../../config/status'
import RequestDetails from '../../components/RequestDetails'
import EvidenceList from '../../components/EvidenceList'
import ApprovalTrail from '../../components/ApprovalTrail'

export default function LecturerRequestPage() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getRequest(id)
      .then(setData)
      .catch((err) => setError(err.message))
  }, [id])

  if (!data) return error ? <p className="error">{error}</p> : <p className="loading">Loading request…</p>
  const { request, evidence, history } = data

  return (
    <div className="page-narrow">
      <Link to="/lecturer" className="back-link">← My requests</Link>
      <div className="page-header">
        <div>
          <h1 className="page-title">{request.request_number}</h1>
          <p className="muted">
            Status: <span className={`status status-${request.status.toLowerCase()}`}>{STATUS_LABEL[request.status]}</span>
          </p>
        </div>
        {request.status === 'RETURNED' && (
          <Link to={`/lecturer/requests/${request.id}/edit`} className="btn-yellow btn-auto">Edit &amp; resubmit</Link>
        )}
      </div>
      <RequestDetails request={request} />
      <EvidenceList requestId={request.id} evidence={evidence} />
      <ApprovalTrail status={request.status} history={history} />
    </div>
  )
}
