// Admin view of one request: full record, evidence, approval history and PDF form.
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../services/api'
import { STATUS_LABEL } from '../../config/status'
import RequestDetails from '../../components/RequestDetails'
import EvidenceList from '../../components/EvidenceList'
import ApprovalTrail from '../../components/ApprovalTrail'

export default function AdminRequestPage() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getRequest(id)
      .then(setData)
      .catch((err) => setError(err.message))
  }, [id])

  async function downloadPdf() {
    setError('')
    try {
      await api.downloadPdf(data.request.id, data.request.request_number)
    } catch (err) {
      setError(err.message)
    }
  }

  if (!data) return error ? <p className="error">{error}</p> : <p className="loading">Loading request…</p>
  const { request, evidence, history } = data

  return (
    <div className="page-narrow">
      <Link to="/admin" className="back-link">← System overview</Link>
      <div className="page-header">
        <div>
          <h1 className="page-title">{request.request_number}</h1>
          <p className="muted">
            Status: <span className={`status status-${request.status.toLowerCase()}`}>{STATUS_LABEL[request.status]}</span>
          </p>
        </div>
        <button type="button" className="btn-outline" onClick={downloadPdf}>Download PDF form</button>
      </div>
      {error && <p className="error">{error}</p>}
      <RequestDetails request={request} />
      <EvidenceList requestId={request.id} evidence={evidence} />
      <ApprovalTrail status={request.status} history={history} />
    </div>
  )
}
