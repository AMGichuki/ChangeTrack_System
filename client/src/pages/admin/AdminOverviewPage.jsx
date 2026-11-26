// Admin "System overview" (wireframe page 9): cards, two charts, and the request report.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../services/api'
import { STATUS_LABEL } from '../../config/status'
import BarList from '../../components/BarList'

// Chart colours (validated): blue from the wireframe, and a deeper gold instead
// of the bright yellow, which was too light to see on white.
const BLUE = '#1565d8'
const GOLD = '#b07d00'

function ageText(days) {
  if (days === null || days === undefined) return '—'
  if (days === 0) return 'today'
  return `${days} working ${days === 1 ? 'day' : 'days'}`
}

export default function AdminOverviewPage() {
  const navigate = useNavigate()
  const [overview, setOverview] = useState(null)
  const [departments, setDepartments] = useState([])
  const [rows, setRows] = useState([])
  const [filters, setFilters] = useState({ search: '', department_id: '', status: '' })
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    Promise.all([api.getOverview(), api.getDepartments()])
      .then(([ov, deps]) => {
        setOverview(ov)
        setDepartments(deps.departments)
      })
      .catch((err) => setError(err.message))
  }, [])

  // Report table: reload 300 ms after the filters change.
  useEffect(() => {
    const timer = setTimeout(() => {
      api.getAdminRequests(filters)
        .then((data) => setRows(data.requests))
        .catch((err) => setError(err.message))
    }, 300)
    return () => clearTimeout(timer)
  }, [filters])

  const setFilter = (e) => setFilters((f) => ({ ...f, [e.target.name]: e.target.value }))

  async function exportReport() {
    setError('')
    setExporting(true)
    try {
      await api.exportAdminRequests(filters)
    } catch (err) {
      setError(err.message)
    } finally {
      setExporting(false)
    }
  }

  const c = overview?.counts

  return (
    <div>
      <h1 className="page-title">System overview</h1>
      <p className="muted">Monitor approval queues, reminders and completed grade changes.</p>
      {error && <p className="error" role="alert">{error}</p>}

      {c && (
        <div className="cards">
          <div className="card-stat navy"><span>All requests</span><strong>{c.total}</strong></div>
          <div className="card-stat yellow"><span>In review</span><strong>{c.in_review}</strong></div>
          <div className="card-stat cream"><span>Posted</span><strong>{c.posted}</strong></div>
          <div className="card-stat light"><span>Returned / rejected</span><strong>{c.returned_rejected}</strong></div>
        </div>
      )}

      {overview && (
        <div className="chart-columns">
          <BarList
            title="Requests by department"
            color={BLUE}
            rows={overview.byDepartment.map((d) => ({ label: d.name, count: d.count }))}
          />
          <BarList
            title="Requests by reason"
            color={GOLD}
            rows={overview.byReason.map((r) => ({ label: r.label, count: r.count }))}
          />
        </div>
      )}

      <div className="page-header report-header">
        <h2 className="section-title">Request report</h2>
        <button type="button" className="btn-outline" onClick={exportReport} disabled={exporting}>
          {exporting ? 'Exporting…' : 'Export report'}
        </button>
      </div>

      <div className="filters">
        <label className="field grow">
          <span>Search</span>
          <input type="search" name="search" placeholder="Request number, course or student ID"
            value={filters.search} onChange={setFilter} />
        </label>
        <label className="field">
          <span>Department</span>
          <select name="department_id" value={filters.department_id} onChange={setFilter}>
            <option value="">All departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select name="status" value={filters.status} onChange={setFilter}>
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>

      <table className="table">
        <thead>
          <tr><th>Request / course</th><th>Department</th><th>Stage / status</th><th>Age</th><th>Record</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><strong>{r.request_number}</strong> · {r.course_code}</td>
              <td>{r.department_name}</td>
              <td><span className={`status status-${r.status.toLowerCase()}`}>{STATUS_LABEL[r.status]}</span></td>
              <td>{ageText(r.age_working_days)}</td>
              <td>
                <button type="button" className="link-button blue" onClick={() => navigate(`/admin/requests/${r.id}`)}>
                  View request
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan="5" className="muted">No requests match these filters.</td></tr>}
        </tbody>
      </table>

      {overview && (
        <p className="small muted">
          Reminders: approver after {overview.settings.approver_reminder_days} working days ·
          Admin escalation after {overview.settings.admin_escalation_days} working days.
          {' '}Age = working days waiting in the current stage.
        </p>
      )}
    </div>
  )
}
