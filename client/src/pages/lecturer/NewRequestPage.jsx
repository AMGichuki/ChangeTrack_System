// Lecturer "New grade change request" screen (wireframe page 3).
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../services/api'
import RequestFormFields from '../../components/RequestFormFields'
import { EMPTY_REQUEST_FORM, checkChosenFiles } from '../../config/requestForm'

export default function NewRequestPage() {
  const navigate = useNavigate()
  const fileInput = useRef(null)
  const [options, setOptions] = useState(null)
  const [form, setForm] = useState(EMPTY_REQUEST_FORM)
  const [files, setFiles] = useState([])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Dropdown lists come from the server, so they always match the server's rules.
  useEffect(() => {
    api.getRequestOptions()
      .then((data) => {
        setOptions(data)
        // Start with the lecturer's own department; they can change it.
        setForm((f) => ({ ...f, term: data.terms[0], department_id: data.defaultDepartmentId ?? '' }))
      })
      .catch((err) => setError(err.message))
  }, [])

  function addFiles(e) {
    setError('')
    const chosen = Array.from(e.target.files)
    e.target.value = '' // lets the same file be chosen again after removing it
    const bytes = [...files, ...chosen].reduce((sum, f) => sum + f.size, 0)
    const problem = checkChosenFiles(chosen, files.length + chosen.length, options, bytes)
    if (problem) return setError(problem)
    setFiles((list) => [...list, ...chosen])
  }

  function removeFile(index) {
    setFiles((list) => list.filter((_, i) => i !== index))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (files.length === 0) return setError('Attach at least one supporting document.')
    if (form.current_grade === form.new_grade) {
      return setError('The proposed grade must be different from the current grade.')
    }
    if (!window.confirm('Submit this request to the Chair? There is no draft: you can only change it if it is returned to you.')) {
      return
    }

    const data = new FormData()
    Object.entries(form).forEach(([key, value]) => data.append(key, value))
    files.forEach((file) => data.append('evidence', file))

    setSubmitting(true)
    try {
      const result = await api.createRequest(data)
      navigate('/lecturer', { state: { created: result.request.request_number } })
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  if (!options) {
    return error ? <p className="error">{error}</p> : <p className="loading">Loading form…</p>
  }

  const hint = form.reason && options.evidenceHints[form.reason]
  const needsDocs = form.current_grade === 'I'

  return (
    <div className="page-narrow">
      <h1 className="page-title">New grade change request</h1>
      <p className="muted">Only lecturers create requests. The student contacts you by email first.</p>

      <form onSubmit={handleSubmit}>
        <RequestFormFields options={options} form={form} setForm={setForm} />

        <section className="panel panel-soft evidence-box">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Supporting evidence *</h2>
              <p className="small muted">
                {hint ? `Needed for this reason: ${hint}.` : 'Upload medical documents, death evidence or a grade schedule.'}
                {needsDocs && ' Documents are required for I grade changes.'}
                {' '}PDF, JPG or PNG, up to {options.evidence.maxFiles} files, {options.evidence.maxTotalMb} MB in total.
              </p>
            </div>
            <button type="button" className="btn-outline" onClick={() => fileInput.current.click()}>
              Upload evidence
            </button>
            <input ref={fileInput} type="file" multiple hidden accept={options.evidence.accept} onChange={addFiles} />
          </div>
          {files.length > 0 && (
            <ul className="file-list">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`}>
                  {f.name} <span className="muted small">({(f.size / 1024).toFixed(0)} KB)</span>
                  <button type="button" className="link-button" onClick={() => removeFile(i)} aria-label={`Remove ${f.name}`}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {error && <p className="error" role="alert">{error}</p>}

        <div className="form-footer">
          <span className="small muted">The request goes straight to the Chair. No draft is saved.</span>
          <button type="submit" className="btn-blue" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit to Chair'}
          </button>
        </div>
      </form>
    </div>
  )
}
