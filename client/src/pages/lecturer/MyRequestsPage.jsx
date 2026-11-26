// Lecturer "My requests" dashboard (wireframe page 2).
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../../services/api'
import { STATUS_LABEL, STAGE_LABEL, formatDate } from '../../config/status'

export default function MyRequestsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  // Message after submitting or resubmitting (passed from the form page).
  const [message, setMessage] = useState(() => {
    if (location.state?.created) return `${location.state.created} was submitted and is now with the Chair.`
    if (location.state?.resubmitted) return `${location.state.resubmitted} was resubmitted and is back with the Chair.`
    return ''
  })
  const [counts, setCounts] = useState(null)
  const [requests, setRequests] = useState([])
  const [returned, setReturned] = useState([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      api.getMyRequests({ search, status })
        .then((data) => {
          setCounts(data.counts)
          setRequests(data.requests)
          setError('')
        })
        .catch((err) => setError(err.message))
    }, 300)
    return () => clearTimeout(timer)
  }, [search, status])

  // "Needs my attention" always lists ALL returned requests, whatever the filters say.
  useEffect(() => {
    api.getMyRequests({ status: 'RETURNED' })
      .then((data) => setReturned(data.requests))
      .catch(() => {})
  }, [])

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">My requests</h1>
          <p className="muted">Track submissions and respond to requests returned for correction.</p>
        </div>
        <Link to="/lecturer/new" className="btn-yellow btn-auto">+ New request</Link>
      </div>

      {message && (
        <div className="notice notice-success" role="status">
          <p><strong>{message}</strong></p>
          <button className="btn-outline" onClick={() => setMessage('')}>OK</button>
        </div>
      )}

      {counts && (
        <div className="cards">
          <div className="card-stat navy"><span>Total requests</span><strong>{counts.total}</strong></div>
          <div className="card-stat yellow"><span>Awaiting approval</span><strong>{counts.awaiting}</strong></div>
          <div className="card-stat cream"><span>Returned</span><strong>{counts.returned}</strong></div>
          <div className="card-stat light"><span>Posted</span><strong>{counts.posted}</strong></div>
        </div>
      )}

      {returned.length > 0 && (
        <section className="attention">
          <h2>Needs my attention · {returned.length} returned {returned.length === 1 ? 'request' : 'requests'}</h2>
          {returned.map((r) => (
            <div key={r.id} className="attention-item">
              <div>
                <p className="small muted">{r.request_number} · {r.course_code}</p>
                <p className="small">
                  {STAGE_LABEL[r.last_stage]}: {r.last_comment}
                </p>
              </div>
              <Link to={`/lecturer/requests/${r.id}/edit`} className="btn-outline btn-auto">
                Edit &amp; resubmit
              </Link>
            </div>
          ))}
        </section>
      )}

      <h2 className="section-title">All requests</h2>
      <div className="filters">
        <label className="field grow">
          <span>Search requests</span>
          <input type="search" placeholder="Request number, course or student ID"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label className="field">
          <span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>

      {error && <p className="error">{error}</p>}

      <table className="table">
        <thead>
          <tr><th>Request / course</th><th>Student ID</th><th>Grade change</th><th>Status</th><th>Submitted</th></tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id} className="clickable" onClick={() => navigate(`/lecturer/requests/${r.id}`)}>
              <td><strong>{r.request_number}</strong><br /><span className="small">{r.course_code} · Section {r.section}</span></td>
              <td>{r.student_number}</td>
              <td>{r.current_grade} → {r.new_grade}</td>
              <td><span className={`status status-${r.status.toLowerCase()}`}>{STATUS_LABEL[r.status]}</span></td>
              <td>{formatDate(r.created_at)}</td>
            </tr>
          ))}
          {requests.length === 0 && (
            <tr><td colSpan="5" className="muted">
              {search || status ? 'No requests match your search.' : 'You have not submitted any requests yet.'}
            </td></tr>
          )}
        </tbody>
      </table>
      <p className="small muted">Showing {requests.length} of {counts?.total ?? 0} requests</p>
    </div>
  )
}
