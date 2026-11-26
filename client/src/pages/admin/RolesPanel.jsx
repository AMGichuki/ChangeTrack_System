// "Roles" box on the Departments & roles page.
// A role here is a JOB TITLE (e.g. "Head of Department") linked to the powers
// of one of ChangeTrack's 5 system roles. The approval chain never changes:
// powers decide what someone can do, the title is what they are called.
import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import { ROLE_LABEL } from '../../config/roles'

const POWERS = ['LECTURER', 'CHAIR', 'DEAN', 'REGISTRAR', 'ADMIN']
const WHAT_IT_CAN_DO = {
  LECTURER: 'Submits and corrects grade change requests',
  CHAIR: "Reviews requests for their department (1st approval)",
  DEAN: "Reviews requests for their department (2nd approval)",
  REGISTRAR: 'Verifies and posts approved grades (all departments)',
  ADMIN: 'Manages users, departments, roles and settings',
}

export default function RolesPanel() {
  const [titles, setTitles] = useState([])
  const [reloadKey, setReloadKey] = useState(0)
  const [form, setForm] = useState({ name: '', base_role: '' })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    api.getJobTitles()
      .then((data) => setTitles(data.jobTitles))
      .catch((err) => setError(err.message))
  }, [reloadKey])

  async function addRole(e) {
    e.preventDefault()
    setError('')
    setMessage('')
    try {
      const data = await api.createJobTitle(form)
      setMessage(`Role added: ${data.jobTitle.name} (${ROLE_LABEL[data.jobTitle.base_role]} powers). You can now give it to staff in Manage users.`)
      setForm({ name: '', base_role: '' })
      setReloadKey((k) => k + 1)
    } catch (err) {
      setError(err.message)
    }
  }

  async function removeRole(t) {
    if (!window.confirm(`Remove the role "${t.name}"?`)) return
    setError('')
    setMessage('')
    try {
      const data = await api.deleteJobTitle(t.id)
      setMessage(data.message)
      setReloadKey((k) => k + 1)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className="panel">
      <h2 className="panel-title">Roles</h2>
      <p className="small muted">
        Add the job titles your school uses. Each one has the powers of a ChangeTrack role, so the approval
        order Lecturer → Chair → Dean → Registrar always stays the same.
      </p>

      <form className="inline-form" onSubmit={addRole}>
        <input placeholder="Role name, e.g. Head of Department" value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
        <select value={form.base_role} onChange={(e) => setForm((f) => ({ ...f, base_role: e.target.value }))} required>
          <option value="">Has the powers of…</option>
          {POWERS.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        <button type="submit" className="btn-blue">Add role</button>
      </form>

      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}

      <table className="table">
        <thead>
          <tr><th>Role</th><th>Powers</th><th>What it can do</th><th>Staff</th><th>Action</th></tr>
        </thead>
        <tbody>
          {titles.map((t) => (
            <tr key={t.id}>
              <td><strong>{t.name}</strong>{t.is_builtin && <span className="small muted"> (built in)</span>}</td>
              <td>{ROLE_LABEL[t.base_role]}</td>
              <td className="small">{WHAT_IT_CAN_DO[t.base_role]}</td>
              <td>{t.people}</td>
              <td className="actions-cell">
                {!t.is_builtin && (
                  <button className="btn-sm delete" onClick={() => removeRole(t)}
                    disabled={t.people > 0} title={t.people > 0 ? 'Give these staff another role first' : 'Remove this role'}>
                    Remove
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
