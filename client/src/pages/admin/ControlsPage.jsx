// Admin "Controls & audit" (wireframe page 11):
// reminder timing, acting approvers and the decision audit log.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../services/api'
import { DECISION_LABEL, STAGE_LABEL } from '../../config/status'
import { ROLE_LABEL } from '../../config/roles'

const todayInKenya = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }) // YYYY-MM-DD

function formatDateTime(value) {
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

const STATE_LABEL = { ACTIVE: 'Active', UPCOMING: 'Upcoming', ENDED: 'Ended' }

export default function ControlsPage() {
  return (
    <div>
      <h1 className="page-title">Controls &amp; audit</h1>
      <p className="muted">Manage acting approvers, reminder timing and the decision record.</p>
      <div className="two-equal">
        <ReminderSettings />
        <ActingApprover />
      </div>
      <section className="panel panel-soft notifications-box">
        <h2 className="panel-title">Automatic email notifications</h2>
        <p className="small">
          Submit → Chair · Chair approves → Dean · Dean approves → Registrar<br />
          Return / reject → Lecturer with reason · Posted → Lecturer and student<br />
          Reminders → approver, then Admin escalation · Acting approvers also receive their stage&apos;s emails
        </p>
        <p className="small muted">Email preview: &ldquo;CT-2026-0142 · IST 2040 · A request needs your review.&rdquo; No grades or names.</p>
      </section>
      <AuditLog />
    </div>
  )
}

// ---------------- Email reminders ----------------
function ReminderSettings() {
  const [form, setForm] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.getSettings()
      .then((data) => setForm(data.settings))
      .catch((err) => setError(err.message))
  }, [])

  async function save(e) {
    e.preventDefault()
    setError('')
    setMessage('')
    try {
      const data = await api.saveSettings({
        approver_reminder_days: Number(form.approver_reminder_days),
        admin_escalation_days: Number(form.admin_escalation_days),
      })
      setForm(data.settings)
      setMessage('Reminder timing saved.')
    } catch (err) {
      setError(err.message)
    }
  }

  async function runNow() {
    setError('')
    setMessage('')
    setBusy(true)
    try {
      const r = await api.runReminders()
      setMessage(r.reminders.length || r.escalations.length
        ? `Checked ${r.checked} waiting requests: sent ${r.reminders.length} reminder(s) and ${r.escalations.length} escalation(s).`
        : `Checked ${r.checked} waiting requests: nothing due (each reminder is sent only once).`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!form) return <section className="panel">{error ? <p className="error">{error}</p> : <p className="loading">Loading…</p>}</section>
  const update = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }))

  return (
    <section className="panel">
      <h2 className="panel-title">Email reminders</h2>
      <form className="form" onSubmit={save}>
        <label className="field">
          <span>Approver reminder (working days)</span>
          <input type="number" name="approver_reminder_days" min="1" max="30" value={form.approver_reminder_days} onChange={update} required />
        </label>
        <label className="field">
          <span>Admin escalation (working days)</span>
          <input type="number" name="admin_escalation_days" min="1" max="30" value={form.admin_escalation_days} onChange={update} required />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        {message && <p className="success" role="status">{message}</p>}
        <div className="button-row">
          <button type="button" className="btn-outline" onClick={runNow} disabled={busy}>
            {busy ? 'Checking…' : 'Run reminders now'}
          </button>
          <button type="submit" className="btn-blue">Save reminders</button>
        </div>
      </form>
      <p className="small muted">Reminders are also checked automatically every hour.</p>
    </section>
  )
}

// ---------------- Acting approver ----------------
function ActingApprover() {
  const [data, setData] = useState(null)
  const [form, setForm] = useState({ approver_id: '', delegate_id: '', start_date: todayInKenya(), end_date: '' })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(() => {
    api.getDelegations().then(setData).catch((err) => setError(err.message))
  }, [])
  useEffect(() => { load() }, [load])

  const approver = data?.approvers.find((a) => a.id === Number(form.approver_id))
  const update = (e) => {
    const { name, value } = e.target
    // Changing the approver clears the delegate (the list of who may cover changes).
    setForm((f) => ({ ...f, [name]: value, ...(name === 'approver_id' ? { delegate_id: '' } : {}) }))
  }

  async function save(e) {
    e.preventDefault()
    setError('')
    setMessage('')
    try {
      await api.createDelegation({
        approver_id: Number(form.approver_id),
        delegate_id: Number(form.delegate_id),
        start_date: form.start_date,
        end_date: form.end_date || null,
      })
      setMessage('Acting approver set. They will see the extra queue the next time they open ChangeTrack.')
      setForm({ approver_id: '', delegate_id: '', start_date: todayInKenya(), end_date: '' })
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function remove(d) {
    if (!window.confirm(`Remove the delegation: ${d.delegate_name} acting for ${d.approver_name}? Decisions already made stay in the audit log.`)) return
    setError('')
    setMessage('')
    try {
      await api.deleteDelegation(d.id)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  if (!data) return <section className="panel">{error ? <p className="error">{error}</p> : <p className="loading">Loading…</p>}</section>

  return (
    <section className="panel">
      <h2 className="panel-title">Acting approver</h2>
      <form className="form" onSubmit={save}>
        <label className="field">
          <span>Approval role / department</span>
          <select name="approver_id" value={form.approver_id} onChange={update} required>
            <option value="">Who will be away?</option>
            {data.approvers.map((a) => (
              <option key={a.id} value={a.id}>{ROLE_LABEL[a.role]} · {a.department_name} ({a.full_name})</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Delegate</span>
          <select name="delegate_id" value={form.delegate_id} onChange={update} required disabled={!approver}>
            <option value="">Select an authorized approver</option>
            {approver?.eligible.map((d) => (
              <option key={d.id} value={d.id}>{d.full_name} ({ROLE_LABEL[d.role]}, {d.department_name})</option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          <label className="field">
            <span>From</span>
            <input type="date" name="start_date" min={todayInKenya()} value={form.start_date} onChange={update} required />
          </label>
          <label className="field">
            <span>Until (optional)</span>
            <input type="date" name="end_date" min={form.start_date} value={form.end_date} onChange={update} />
          </label>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {message && <p className="success" role="status">{message}</p>}
        <div className="button-row">
          <span className="small muted">No self-approval or skipped stages.</span>
          <button type="submit" className="btn-blue">Set delegation</button>
        </div>
      </form>

      {data.delegations.length > 0 && (
        <ul className="delegation-list">
          {data.delegations.map((d) => (
            <li key={d.id}>
              <div>
                <strong>{d.delegate_name}</strong> acting for {d.approver_name}
                <span className="small muted"> ({ROLE_LABEL[d.approver_role]})</span><br />
                <span className="small muted">{d.start_date} → {d.end_date || 'until removed'}</span>
              </div>
              <span className={`pill ${d.state === 'ACTIVE' ? 'pill-on' : 'pill-neutral'}`}>{STATE_LABEL[d.state]}</span>
              <button type="button" className="link-button" onClick={() => remove(d)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ---------------- Decision audit log ----------------
function AuditLog() {
  const [entries, setEntries] = useState(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      api.getAudit(search)
        .then((data) => setEntries(data.entries))
        .catch((err) => setError(err.message))
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  async function exportLog() {
    setError('')
    try {
      await api.exportAudit(search)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className="audit">
      <div className="page-header report-header">
        <h2 className="section-title">Decision audit log</h2>
        <button type="button" className="btn-outline" onClick={exportLog}>Export audit log</button>
      </div>
      <input type="search" className="search-input" placeholder="Search by request number, course or person"
        value={search} onChange={(e) => setSearch(e.target.value)} />
      {error && <p className="error">{error}</p>}
      <table className="table">
        <thead>
          <tr><th>Request</th><th>Decision / stage</th><th>Decided by</th><th>Date / time</th></tr>
        </thead>
        <tbody>
          {entries?.map((e) => (
            <tr key={e.id}>
              <td><Link to={`/admin/requests/${e.request_id}`} className="link-button blue">{e.request_number}</Link></td>
              <td>{DECISION_LABEL[e.decision]} · {STAGE_LABEL[e.stage]}</td>
              <td>{e.decided_by}{e.acting_for && <span className="small muted"> (acting for {e.acting_for})</span>}</td>
              <td>{formatDateTime(e.decided_at)}</td>
            </tr>
          ))}
          {entries && entries.length === 0 && <tr><td colSpan="4" className="muted">No decisions match your search.</td></tr>}
        </tbody>
      </table>
      <p className="small muted">Open a record to see comments and the full approval history.</p>
    </section>
  )
}
