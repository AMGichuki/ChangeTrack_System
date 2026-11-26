// The "Student & course" and "Grade & reason" part of the request form.
// Shared by New request and Correct returned request, so both follow the same rules.
import { useState } from 'react'
import { api } from '../services/api'

export default function RequestFormFields({ options, form, setForm, initialStudentName = '' }) {
  const [studentName, setStudentName] = useState(initialStudentName)
  const [studentError, setStudentError] = useState('')

  function updateField(e) {
    const { name, value } = e.target
    setForm((f) => ({ ...f, [name]: value }))
    if (name === 'student_number') {
      setStudentName('')
      setStudentError('')
    }
  }

  // When the lecturer leaves the Student ID box, show the student's name to confirm.
  async function checkStudent() {
    const number = form.student_number.trim()
    if (!number) return
    try {
      const data = await api.lookupStudent(number)
      setStudentName(data.student.department_name
        ? `${data.student.full_name} · ${data.student.department_name}`
        : data.student.full_name)
      setStudentError('')
    } catch {
      setStudentName('')
      setStudentError('Student ID not found. Check it, or ask the Admin to add the student.')
    }
  }

  return (
    <section className="panel">
      <h2 className="panel-title">Student &amp; course</h2>
      <div className="form-grid">
        <label className="field full">
          <span>Department this request is for *</span>
          <select name="department_id" value={form.department_id} onChange={updateField} required>
            <option value="">Select department</option>
            {options.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <small className="muted">Its Chair and Dean will review the request.</small>
        </label>
        <label className="field">
          <span>Student ID *</span>
          <input name="student_number" inputMode="numeric" placeholder="e.g. 102341" value={form.student_number}
            onChange={updateField} onBlur={checkStudent} required />
          {studentName && <small className="success">✓ {studentName}</small>}
          {studentError && <small className="error">{studentError}</small>}
        </label>
        <label className="field">
          <span>Course code *</span>
          <input name="course_code" placeholder="e.g. IST 2040" value={form.course_code} onChange={updateField} required />
        </label>
        <label className="field">
          <span>Section *</span>
          <input name="section" placeholder="e.g. A" maxLength={3} value={form.section} onChange={updateField} required />
        </label>
        <label className="field">
          <span>Term *</span>
          <select name="term" value={form.term} onChange={updateField} required>
            {options.terms.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
      </div>

      <h2 className="panel-title spaced">Grade &amp; reason</h2>
      <div className="form-grid">
        <label className="field">
          <span>Current grade *</span>
          <select name="current_grade" value={form.current_grade} onChange={updateField} required>
            <option value="">Select grade</option>
            {options.grades.map((g) => <option key={g}>{g}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Proposed grade *</span>
          <select name="new_grade" value={form.new_grade} onChange={updateField} required>
            <option value="">Select grade</option>
            {options.newGrades.map((g) => <option key={g}>{g}</option>)}
          </select>
        </label>
        <label className="field full">
          <span>Reason *</span>
          <select name="reason" value={form.reason} onChange={updateField} required>
            <option value="">Illness / Death / Arithmetic / Other</option>
            {options.reasons.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>
        <label className="field full">
          <span>Justification *</span>
          <textarea name="justification" rows={4} placeholder="Explain the reason for this grade change."
            minLength={20} maxLength={2000} value={form.justification} onChange={updateField} required />
          <small className="muted">{form.justification.trim().length} / 2000 (at least 20)</small>
        </label>
      </div>
      <p className="small muted">Check the student and course details against school records.</p>
    </section>
  )
}
