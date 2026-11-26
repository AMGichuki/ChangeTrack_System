// Lecturer "Correct returned request" screen (wireframe page 4).
// Only for requests that were returned. Resubmitting always sends it back to the Chair.
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../services/api'
import { STAGE_LABEL, formatDate } from '../../config/status'
import { checkChosenFiles } from '../../config/requestForm'
import RequestFormFields from '../../components/RequestFormFields'

export default function EditRequestPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const fileInput = useRef(null)

  const [options, setOptions] = useState(null)
  const [loaded, setLoaded] = useState(null)       // { request, evidence, history }
  const [form, setForm] = useState(null)
  const [removeIds, setRemoveIds] = useState([])   // existing files marked for removal
  const [newFiles, setNewFiles] = useState([])
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([api.getRequestOptions(), api.getRequest(id)])
      .then(([opts, data]) => {
        setOptions(opts)
        setLoaded(data)
        const r = data.request
        setForm({
          department_id: r.department_id,
          student_number: r.student_number,
          course_code: r.course_code,
          section: r.section,
          term: opts.terms.includes(r.term) ? r.term : opts.terms[0],
          current_grade: r.current_grade,
          new_grade: r.new_grade,
          reason: r.reason,
          justification: r.justification,
        })
      })
      .catch((err) => setError(err.message))
  }, [id])

  if (!loaded || !form) {
    return error ? <p className="error">{error}</p> : <p className="loading">Loading request…</p>
  }

  const { request, evidence, history } = loaded

  if (request.status !== 'RETURNED') {
    return (
      <div className="page-narrow">
        <h1 className="page-title">{request.request_number}</h1>
        <p className="muted">This request is not waiting for correction, so it cannot be edited.</p>
        <Link to={`/lecturer/requests/${request.id}`} className="btn-outline btn-auto">View request</Link>
      </div>
    )
  }

  // The decision that returned it (the latest "Returned").
  const returnedBy = [...history].reverse().find((h) => h.decision === 'RETURNED')
  const keptCount = evidence.length - removeIds.length

  function toggleRemove(evId) {
    setRemoveIds((ids) => (ids.includes(evId) ? ids.filter((x) => x !== evId) : [...ids, evId]))
  }

  function addFiles(e) {
    setError('')
    const chosen = Array.from(e.target.files)
    e.target.value = ''
    const bytes = [...newFiles, ...chosen].reduce((sum, f) => sum + f.size, 0) // only NEW files are sent
    const problem = checkChosenFiles(chosen, keptCount + newFiles.length + chosen.length, options, bytes)
    if (problem) return setError(problem)
    setNewFiles((list) => [...list, ...chosen])
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (keptCount + newFiles.length === 0) return setError('Keep or attach at least one supporting document.')
    if (form.current_grade === form.new_grade) {
      return setError('The proposed grade must be different from the current grade.')
    }
    if (!window.confirm('Resubmit this request? It goes back to the Chair, and every stage checks it again.')) return

    const data = new FormData()
    Object.entries(form).forEach(([key, value]) => data.append(key, value))
    data.append('note', note)
    removeIds.forEach((evId) => data.append('remove_evidence', evId))
    newFiles.forEach((file) => data.append('evidence', file))

    setBusy(true)
    try {
      await api.resubmitRequest(request.id, data)
      navigate('/lecturer', { state: { resubmitted: request.request_number } })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="page-narrow">
      <h1 className="page-title">Correct returned request</h1>
      <p className="muted">{request.request_number} · Update the request, then resubmit to the Chair.</p>

      {returnedBy && (
        <div className="attention">
          <h2>Returned by {STAGE_LABEL[returnedBy.stage]} · {formatDate(returnedBy.decided_at)}</h2>
          <p className="pre-wrap">&ldquo;{returnedBy.comment}&rdquo;</p>
          <p className="small muted">Your earlier submission remains in the decision history.</p>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <RequestFormFields options={options} form={form} setForm={setForm} initialStudentName={request.student_name} />

        <section className="panel panel-soft evidence-box">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Supporting evidence *</h2>
              <p className="small muted">Documents are required for I grade changes.</p>
            </div>
            <button type="button" className="btn-outline" onClick={() => fileInput.current.click()}>
              Replace / add file
            </button>
            <input ref={fileInput} type="file" multiple hidden accept={options.evidence.accept} onChange={addFiles} />
          </div>
          <ul className="file-list">
            {evidence.map((f) => {
              const removing = removeIds.includes(f.id)
              return (
                <li key={f.id} className={removing ? 'file-removing' : ''}>
                  {f.file_name} <span className="muted small">{removing ? '(will be removed)' : '· Attached'}</span>
                  <button type="button" className="link-button" onClick={() => toggleRemove(f.id)}>
                    {removing ? 'Keep' : 'Remove'}
                  </button>
                </li>
              )
            })}
            {newFiles.map((f, i) => (
              <li key={`new-${f.name}-${i}`}>
                {f.name} <span className="muted small">· New</span>
                <button type="button" className="link-button" onClick={() => setNewFiles((l) => l.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <label className="field">
            <span>Note to the Chair (optional)</span>
            <textarea rows={2} maxLength={500} placeholder="e.g. Attached the full grade schedule as asked."
              value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <p className="small muted">We also record automatically what you changed, for the decision history.</p>
        </section>

        {error && <p className="error" role="alert">{error}</p>}

        <div className="form-footer">
          <span className="small muted">The Chair is emailed after resubmission. No draft is saved.</span>
          <button type="submit" className="btn-blue" disabled={busy}>
            {busy ? 'Resubmitting…' : 'Resubmit to Chair'}
          </button>
        </div>
      </form>
    </div>
  )
}
