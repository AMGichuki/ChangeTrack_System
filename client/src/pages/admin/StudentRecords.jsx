// "Student contact records" box on the Manage users screen.
// The Admin adds students (with a password), edits everything about a student
// (student ID, name, email, department), sets a new password, or deletes a student.
import { useEffect, useRef, useState } from 'react'
import { api } from '../../services/api'
import { checkNewPassword, EMPTY_PASSWORD } from '../../config/passwordRule'
import NewPasswordFields from '../../components/NewPasswordFields'

const EMPTY_STUDENT = { student_number: '', full_name: '', email: '', department_id: '' }

export default function StudentRecords({ departments = [] }) {
  const [students, setStudents] = useState([])
  const [search, setSearch] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // One form for both "Add student" and "Edit student".
  // editing = the student being edited, or null when adding.
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_STUDENT)
  const [password, setPassword] = useState(EMPTY_PASSWORD) // only when adding
  const formRef = useRef(null)

  const [passwordFor, setPasswordFor] = useState(null) // student getting a new password
  const [newPassword, setNewPassword] = useState(EMPTY_PASSWORD)

  useEffect(() => {
    const timer = setTimeout(() => {
      api.getStudents({ search })
        .then((data) => setStudents(data.students))
        .catch((err) => setError(err.message))
    }, 300)
    return () => clearTimeout(timer)
  }, [search, reloadKey])

  function clearMessages() {
    setError('')
    setMessage('')
  }

  function scrollToForm() {
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      formRef.current?.querySelector('input')?.focus()
    }, 0)
  }

  function startAdd() {
    if (showForm && !editing) return closeForm() // the button works as "Close"
    setEditing(null)
    setForm(EMPTY_STUDENT)
    setPassword(EMPTY_PASSWORD)
    setPasswordFor(null)
    setShowForm(true)
    clearMessages()
    scrollToForm()
  }

  function startEdit(s) {
    setEditing(s)
    setForm({
      student_number: s.student_number,
      full_name: s.full_name,
      email: s.email,
      department_id: s.department_id ? String(s.department_id) : '',
    })
    setPasswordFor(null)
    setShowForm(true)
    clearMessages()
    scrollToForm()
  }

  function closeForm() {
    setShowForm(false)
    setEditing(null)
    setForm(EMPTY_STUDENT)
    setPassword(EMPTY_PASSWORD)
  }

  async function saveStudent(e) {
    e.preventDefault()
    clearMessages()
    const body = { ...form, department_id: Number(form.department_id) }
    try {
      if (editing) {
        const data = await api.updateStudent(editing.id, body)
        setMessage(`Changes saved for ${data.student.full_name}.`)
      } else {
        const problem = checkNewPassword(password.password, password.confirm)
        if (problem) return setError(problem)
        const data = await api.createStudent({ ...body, password: password.password })
        setMessage(`Student added: ${data.student.full_name}. Give them their password privately.`)
      }
      closeForm()
      setReloadKey((k) => k + 1)
    } catch (err) {
      setError(err.message)
    }
  }

  function startPassword(s) {
    setPasswordFor(s)
    setNewPassword(EMPTY_PASSWORD)
    closeForm()
    clearMessages()
  }

  async function savePassword(e) {
    e.preventDefault()
    clearMessages()
    const problem = checkNewPassword(newPassword.password, newPassword.confirm)
    if (problem) return setError(problem)
    try {
      const data = await api.setStudentPassword(passwordFor.id, newPassword.password)
      setMessage(data.message)
      setPasswordFor(null)
      setNewPassword(EMPTY_PASSWORD)
    } catch (err) {
      setError(err.message)
    }
  }

  async function deleteStudent(s) {
    if (!window.confirm(`Delete ${s.full_name} (${s.student_number})?\n\nTheir record and login will be removed from ChangeTrack. This cannot be undone.`)) return
    clearMessages()
    try {
      const data = await api.deleteStudent(s.id)
      setMessage(data.message)
      if (passwordFor?.id === s.id) setPasswordFor(null)
      if (editing?.id === s.id) closeForm()
      setReloadKey((k) => k + 1)
    } catch (err) {
      setError(err.message)
    }
  }

  const update = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }))

  return (
    <section className="panel panel-soft">
      <div className="panel-header">
        <h2 className="panel-title">Student contact records</h2>
        <button className="btn-outline" onClick={startAdd}>
          {showForm && !editing ? 'Close' : '+ Add student'}
        </button>
      </div>

      {showForm && (
        <form className="password-row" onSubmit={saveStudent} ref={formRef}>
          <h3 className="panel-title">{editing ? `Edit student: ${editing.full_name}` : 'Add student'}</h3>
          <div className="form-grid">
            <label className="field">
              <span>Student ID (numbers only) *</span>
              <input name="student_number" inputMode="numeric" pattern="[0-9]{1,20}" title="Numbers only, e.g. 102341"
                placeholder="e.g. 102341" value={form.student_number} onChange={update} required />
            </label>
            <label className="field">
              <span>Full name *</span>
              <input name="full_name" placeholder="Full name" value={form.full_name} onChange={update} required />
            </label>
            <label className="field">
              <span>Email address *</span>
              <input name="email" type="email" placeholder="student@gmail.com" value={form.email} onChange={update} required />
            </label>
            <label className="field">
              <span>Department *</span>
              <select name="department_id" value={form.department_id} onChange={update} required>
                <option value="">Select department</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            {!editing && <NewPasswordFields value={password} onChange={setPassword} />}
          </div>
          {editing && (
            <p className="small muted">Changing the email also changes the email the student signs in with. To change the password, use Set password.</p>
          )}
          <div className="button-row">
            <button type="submit" className="btn-blue">{editing ? 'Save changes' : 'Add student'}</button>
            <button type="button" className="btn-outline" onClick={closeForm}>Cancel</button>
          </div>
        </form>
      )}

      {passwordFor && (
        <form className="form-grid password-row" onSubmit={savePassword}>
          <p className="small"><strong>Set a new password for {passwordFor.full_name}</strong> ({passwordFor.student_number})</p>
          <span />
          <NewPasswordFields value={newPassword} onChange={setNewPassword} label="New password" />
          <div className="button-row">
            <button type="submit" className="btn-blue">Set password</button>
            <button type="button" className="btn-outline" onClick={() => setPasswordFor(null)}>Cancel</button>
          </div>
        </form>
      )}

      <input
        type="search"
        className="search-input"
        placeholder="Search by student ID, name or email"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}

      <table className="table">
        <thead>
          <tr><th>Student ID</th><th>Name</th><th>Department</th><th>Email</th><th>Action</th></tr>
        </thead>
        <tbody>
          {students.map((s) => (
            <tr key={s.id} className={editing?.id === s.id ? 'row-selected' : ''}>
              <td>{s.student_number}</td>
              <td>{s.full_name}</td>
              <td>{s.department_name || <span className="pill pill-off">Not set</span>}</td>
              <td>{s.email}</td>
              <td className="actions-cell">
                <div className="row-actions">
                  <button className="btn-sm edit" onClick={() => startEdit(s)}>Edit</button>
                  <button className="btn-sm key" onClick={() => startPassword(s)}>Set password</button>
                  <button className="btn-sm delete" onClick={() => deleteStudent(s)}>Delete</button>
                </div>
              </td>
            </tr>
          ))}
          {students.length === 0 && (
            <tr><td colSpan="5" className="muted">No students match your search.</td></tr>
          )}
        </tbody>
      </table>
    </section>
  )
}
