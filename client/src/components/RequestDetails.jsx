// The details card of one request (left side of the Chair / Dean / Registrar screens).
import { REASON_LABEL } from '../config/status'

export default function RequestDetails({ request }) {
  return (
    <section className="panel">
      <h2 className="request-number">{request.request_number}</h2>
      <p className="small muted">Department: {request.department_name}</p>

      <dl className="details-grid">
        <div><dt>Student</dt><dd>{request.student_number} · {request.student_name}</dd></div>
        <div><dt>Lecturer</dt><dd>{request.lecturer_name}</dd></div>
        <div><dt>Course / section</dt><dd>{request.course_code} · Section {request.section}</dd></div>
        <div><dt>Term</dt><dd>{request.term}</dd></div>
        <div><dt>Current grade</dt><dd>{request.current_grade}</dd></div>
        <div><dt>Proposed grade</dt><dd>{request.new_grade}</dd></div>
        <div className="full"><dt>Reason</dt><dd>{REASON_LABEL[request.reason]}</dd></div>
        <div className="full"><dt>Justification</dt><dd className="pre-wrap">{request.justification}</dd></div>
      </dl>
    </section>
  )
}
