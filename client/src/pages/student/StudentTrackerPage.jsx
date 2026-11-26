// Student "My grade review" screen (wireframe page 8). Read-only: no buttons.
// The server sends only progress steps and dates, never grades or comments.
import { useEffect, useState } from 'react'
import { api } from '../../services/api'

export default function StudentTrackerPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getMyProgress()
      .then(setData)
      .catch((err) => setError(err.message))
  }, [])

  return (
    <div>
      <h1 className="student-title">My grade review</h1>
      <p className="muted">Read-only progress{data ? ` · ${data.student_number}` : ''}</p>

      <div className="attention student-note">
        <h2>Need a grade review?</h2>
        <p>Email your lecturer. Only your lecturer can create or change a request.</p>
      </div>

      {error && <p className="error">{error}</p>}
      {!data && !error && <p className="loading">Loading…</p>}

      {data && data.requests.length === 0 && (
        <p className="muted">You have no grade change requests at the moment.</p>
      )}

      {data?.requests.map((r) => (
        <div key={r.request_number} className="student-request">
          <section className="panel">
            <h2 className="student-request-title">{r.request_number} · {r.course_code}</h2>
            <p className="muted">Section {r.section} · {r.term}</p>
            <p className={`student-status student-status-${r.status.toLowerCase()}`}>Status: {r.status_text}</p>
          </section>

          <section className="panel">
            <h3 className="panel-title">Approval progress</h3>
            <ol className="progress-steps">
              {r.steps.map((step, i) => (
                <li key={step.label} className={`progress-step step-${step.state}`}>
                  <span className="step-number">{i + 1}</span>
                  <div>
                    <strong>{step.label}</strong>
                    <p className="small muted">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      ))}

      <p className="small muted">
        You&apos;ll receive an email when the grade is posted. The Registrar updates the school&apos;s grading system.
      </p>
    </div>
  )
}
