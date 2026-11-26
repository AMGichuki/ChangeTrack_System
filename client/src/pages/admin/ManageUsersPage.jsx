// Admin "Manage users" screen (wireframe page 10).
import { useEffect, useRef, useState } from 'react'
import { api } from '../../services/api'
import { ROLE_LABEL } from '../../config/roles'
import { useAuth } from '../../context/useAuth'
import { checkNewPassword, EMPTY_PASSWORD } from '../../config/passwordRule'
import NewPasswordFields from '../../components/NewPasswordFields'
import StudentRecords from './StudentRecords'

const STAFF_ROLES = ['LECTURER', 'CHAIR', 'DEAN', 'REGISTRAR', 'ADMIN']
// These roles work inside one ACADEMIC department (Registrar and Admin work in offices).
const ACADEMIC_ROLES = ['LECTURER', 'CHAIR', 'DEAN']
// job_title_id = the role (job title) picked; its powers decide what the person can do.
const EMPTY_FORM = { id: null, full_name: '', email: '', job_title_id: '', department_id: '', is_active: true }

export default function ManageUsersPage() {
  const { user: me } = useAuth()
  const [departments, setDepartments] = useState([])
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [listError, setListError] = useState('')
  const [listMessage, setListMessage] = useState('') // e.g. "Ann Wambui was deleted."
  const [reloadKey, setReloadKey] = useState(0) // change it to reload the table

  const [form, setForm] = useState(EMPTY_FORM)
  const [password, setPassword] = useState(EMPTY_PASSWORD) // new account's password
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState('')

  // "Set a new password" box (only while editing someone)
  const [newPassword, setNewPassword] = useState(EMPTY_PASSWORD)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSaved, setPasswordSaved] = useState('')

  const editing = form.id !== null
  const passwordBoxRef = useRef(null)

  // Departments and roles (job titles) for the dropdowns.
  // They are added on the "Departments & roles" page.
  const [jobTitles, setJobTitles] = useState([])
  useEffect(() => {
    Promise.all([api.getDepartments(), api.getJobTitles()])
      .then(([d, t]) => { setDepartments(d.departments); setJobTitles(t.jobTitles) })
      .catch((err) => setListError(err.message))
  }, [])

  const powersOf = (titleId) => jobTitles.find((t) => String(t.id) === String(titleId))?.base_role || ''
  const formRole = powersOf(form.job_title_id)

  // A Lecturer, Chair or Dean (or a title with their powers) can only be in an academic department.
  const departmentChoices = ACADEMIC_ROLES.includes(formRole)
    ? departments.filter((d) => d.is_academic)
    : departments

  // Staff table. Waits 300 ms after typing so we don't call the server on every key.
  useEffect(() => {
    const timer = setTimeout(() => {
      api.getStaff({ search, role: roleFilter })
        .then((data) => { setUsers(data.users); setListError('') })
        .catch((err) => setListError(err.message))
    }, 300)
    return () => clearTimeout(timer)
  }, [search, roleFilter, reloadKey])

  function updateField(e) {
    const { name, value, type, checked } = e.target
    setForm((f) => {
      const next = { ...f, [name]: type === 'checkbox' ? checked : value }
      // Changed to a Lecturer/Chair/Dean role while an office is chosen? Clear the department.
      if (name === 'job_title_id' && ACADEMIC_ROLES.includes(powersOf(value))) {
        const chosen = departments.find((d) => String(d.id) === String(next.department_id))
        if (chosen && !chosen.is_academic) next.department_id = ''
      }
      return next
    })
  }

  function clearMessages() {
    setFormError('')
    setSaved('')
    setPasswordError('')
    setPasswordSaved('')
    setListMessage('')
    setListError('')
  }

  function startEdit(u) {
    setForm({
      id: u.id,
      full_name: u.full_name,
      email: u.email,
      job_title_id: String(u.job_title_id ?? jobTitles.find((t) => t.is_builtin && t.base_role === u.role)?.id ?? ''),
      department_id: String(u.department_id),
      is_active: u.is_active,
    })
    setNewPassword(EMPTY_PASSWORD)
    clearMessages()
  }

  // "Set password" in the table: open that person and jump to the password box.
  function startSetPassword(u) {
    startEdit(u)
    setTimeout(() => {
      passwordBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      passwordBoxRef.current?.querySelector('input')?.focus()
    }, 0)
  }

  function cancelEdit() {
    setForm(EMPTY_FORM)
    setPassword(EMPTY_PASSWORD)
    clearMessages()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    clearMessages()
    if (!editing) {
      const problem = checkNewPassword(password.password, password.confirm)
      if (problem) return setFormError(problem)
    }
    setSaving(true)
    const body = { ...form, job_title_id: Number(form.job_title_id), department_id: Number(form.department_id) }
    try {
      if (editing) {
        await api.updateStaff(form.id, body)
        setSaved('Changes saved.')
      } else {
        const data = await api.createStaff({ ...body, password: password.password })
        setSaved(`Account created for ${data.user.full_name}. Give them their password privately (not in a group chat).`)
        setPassword(EMPTY_PASSWORD)
      }
      setForm(EMPTY_FORM)
      setReloadKey((k) => k + 1)
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function changePassword(e) {
    e.preventDefault()
    setPasswordError('')
    setPasswordSaved('')
    const problem = checkNewPassword(newPassword.password, newPassword.confirm)
    if (problem) return setPasswordError(problem)
    try {
      const data = await api.setStaffPassword(form.id, newPassword.password)
      setPasswordSaved(data.message)
      setNewPassword(EMPTY_PASSWORD)
    } catch (err) {
      setPasswordError(err.message)
    }
  }

  async function deleteUser(u) {
    if (!window.confirm(`Delete ${u.full_name}?\n\nTheir account and login will be removed from ChangeTrack. This cannot be undone.`)) return
    clearMessages()
    try {
      const data = await api.deleteStaff(u.id)
      setListMessage(data.message)
      if (form.id === u.id) setForm(EMPTY_FORM)
      setReloadKey((k) => k + 1)
    } catch (err) {
      setListError(err.message)
    }
  }

  return (
    <div>
      <h1 className="page-title">Manage users</h1>
      <p className="muted">Create school accounts, assign roles and keep user and student emails up to date.</p>

      <div className="two-columns">
        {/* ---------- Left: staff list ---------- */}
        <section>
          <div className="filters">
            <label className="field grow">
              <span>Search users</span>
              <input
                type="search"
                placeholder="Name or email address"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Role</span>
              <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                <option value="">All roles</option>
                {STAFF_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </label>
          </div>

          {listError && <p className="error" role="alert">{listError}</p>}
          {listMessage && <p className="success" role="status">{listMessage}</p>}

          <table className="table">
            <thead>
              <tr><th>Name / email</th><th>Role</th><th>Department</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={form.id === u.id ? 'row-selected' : ''}>
                  <td><strong>{u.full_name}</strong><br /><span className="small muted">{u.email}</span></td>
                  <td>
                    {u.job_title || ROLE_LABEL[u.role]}
                    {jobTitles.some((t) => t.id === u.job_title_id && !t.is_builtin) && (
                      <><br /><span className="small muted">{ROLE_LABEL[u.role]} powers</span></>
                    )}
                  </td>
                  <td>{u.department_name}</td>
                  <td>
                    <span className={u.is_active ? 'pill pill-on' : 'pill pill-off'}>
                      {u.is_active ? 'Active' : 'Switched off'}
                    </span>
                  </td>
                  <td className="actions-cell">
                    <div className="row-actions">
                      <button className="btn-sm edit" onClick={() => startEdit(u)}>Edit</button>
                      <button className="btn-sm key" onClick={() => startSetPassword(u)}>Set password</button>
                      {u.id !== me.id && (
                        <button className="btn-sm delete" onClick={() => deleteUser(u)}>Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan="5" className="muted">No users match your search.</td></tr>
              )}
            </tbody>
          </table>
        </section>

        {/* ---------- Right: create / edit form ---------- */}
        <section className="panel">
          <h2 className="panel-title">{editing ? 'Edit account' : 'Create account'}</h2>
          <form onSubmit={handleSubmit} className="form">
            <label className="field">
              <span>Full name *</span>
              <input name="full_name" placeholder="Enter full name" value={form.full_name} onChange={updateField} required />
            </label>
            <label className="field">
              <span>Email address *</span>
              <input name="email" type="email" placeholder="name@gmail.com" value={form.email} onChange={updateField} required />
            </label>
            <label className="field">
              <span>Role *</span>
              <select name="job_title_id" value={form.job_title_id} onChange={updateField} required>
                <option value="">Select role</option>
                {STAFF_ROLES.map((r) => (
                  <optgroup key={r} label={`${ROLE_LABEL[r]} powers`}>
                    {jobTitles.filter((t) => t.base_role === r).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Department *</span>
              <select name="department_id" value={form.department_id} onChange={updateField} required>
                <option value="">Select department</option>
                {departmentChoices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>

            {!editing && <NewPasswordFields value={password} onChange={setPassword} />}

            {editing && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  name="is_active"
                  checked={form.is_active}
                  onChange={updateField}
                  disabled={form.id === me.id}
                />
                Account active {form.id === me.id && <span className="small muted">(you cannot switch off your own account)</span>}
              </label>
            )}

            {formError && <p className="error" role="alert">{formError}</p>}
            {saved && <p className="success" role="status">{saved}</p>}

            <button type="submit" className="btn-blue" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create account'}
            </button>
            {editing && <button type="button" className="btn-outline" onClick={cancelEdit}>Cancel</button>}
          </form>

          {editing && (
            <form onSubmit={changePassword} className="form password-box" ref={passwordBoxRef}>
              <h3 className="panel-title">Set a new password for {form.full_name}</h3>
              <NewPasswordFields value={newPassword} onChange={setNewPassword} label="New password" />
              {passwordError && <p className="error" role="alert">{passwordError}</p>}
              {passwordSaved && <p className="success" role="status">{passwordSaved}</p>}
              <button type="submit" className="btn-outline">Set password</button>
            </form>
          )}

          <p className="small muted">
            {editing
              ? 'Switching an account off blocks sign in straight away. The history is kept. Passwords are never shown; users can also change theirs with "Forgot password".'
              : 'Users do not self-register. They can change this password later with "Forgot password".'}
          </p>
        </section>
      </div>

      <StudentRecords departments={departments.filter((d) => d.is_academic)} />

      <p className="small muted">Email is required for every user and student.</p>
    </div>
  )
}
