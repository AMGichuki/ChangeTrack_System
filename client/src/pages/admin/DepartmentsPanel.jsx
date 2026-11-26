// "Departments" box on the Manage users screen.
// Shows who is Chair and Dean of each department (so the Admin can see a
// department that is missing one) and lets the Admin add a new department.
import { useEffect, useState } from 'react'
import { api } from '../../services/api'

export default function DepartmentsPanel({ reloadKey, onDepartmentAdded }) {
  const [departments, setDepartments] = useState([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', is_academic: 'true' })
  const [ownReload, setOwnReload] = useState(0)

  useEffect(() => {
    api.getDepartmentOverview()
      .then((data) => setDepartments(data.departments))
      .catch((err) => setError(err.message))
  }, [reloadKey, ownReload])

  async function addDepartment(e) {
    e.preventDefault()
    setError('')
    setMessage('')
    try {
      const data = await api.createDepartment({ name: form.name, is_academic: form.is_academic === 'true' })
      setMessage(`Department added: ${data.department.name}. Now create its Chair and Dean in the form above.`)
      setForm({ name: '', is_academic: 'true' })
      setShowAdd(false)
      setOwnReload((k) => k + 1)
      onDepartmentAdded?.()
    } catch (err) {
      setError(err.message)
    }
  }

  // An academic department needs a Chair and a Dean, or its requests get stuck.
  const who = (d, names) => {
    if (names) return names
    return d.is_academic ? <span className="pill pill-off">Missing</span> : <span className="muted">—</span>
  }

  return (
    <section className="panel panel-soft">
      <div className="panel-header">
        <h2 className="panel-title">Departments</h2>
        <button className="btn-outline" onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? 'Close' : '+ Add department'}
        </button>
      </div>
      <p className="small muted">
        Each academic department needs its own Chair and Dean: they only see and approve requests for their department.
      </p>

      {showAdd && (
        <form className="inline-form" onSubmit={addDepartment}>
          <input name="name" placeholder="Department name, e.g. Humanities" value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          <select value={form.is_academic} onChange={(e) => setForm((f) => ({ ...f, is_academic: e.target.value }))}>
            <option value="true">Academic department</option>
            <option value="false">Office (e.g. Registry)</option>
          </select>
          <button type="submit" className="btn-blue">Add department</button>
        </form>
      )}

      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}

      <table className="table">
        <thead>
          <tr><th>Department</th><th>Type</th><th>Chair</th><th>Dean</th><th>Lecturers</th><th>Students</th><th>Requests</th></tr>
        </thead>
        <tbody>
          {departments.map((d) => (
            <tr key={d.id}>
              <td><strong>{d.name}</strong></td>
              <td>{d.is_academic ? 'Academic' : 'Office'}</td>
              <td>{who(d, d.chairs)}</td>
              <td>{who(d, d.deans)}</td>
              <td>{d.is_academic ? d.lecturers : '—'}</td>
              <td>{d.is_academic ? d.students : '—'}</td>
              <td>{d.is_academic ? d.requests : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
