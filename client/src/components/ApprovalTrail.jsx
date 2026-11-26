// "Approval history · Fixed order, no stages skipped"
//   Lecturer · 12 Nov 2026 → Chair · Current → Dean · Pending → Registrar · Pending
// plus the full decision log (with comments) underneath.
import { DECISION_LABEL, STAGE_LABEL, formatDate } from '../config/status'

const STAGES = ['LECTURER', 'CHAIR', 'DEAN', 'REGISTRAR']
const CURRENT_STAGE = { WITH_CHAIR: 'CHAIR', WITH_DEAN: 'DEAN', WITH_REGISTRAR: 'REGISTRAR' }

// Only look at the latest round: everything since the last (re)submission.
function latestRound(history) {
  let start = 0
  history.forEach((h, i) => {
    if (h.decision === 'SUBMITTED' || h.decision === 'RESUBMITTED') start = i
  })
  return history.slice(start)
}

export default function ApprovalTrail({ status, history }) {
  const round = latestRound(history)
  const current = CURRENT_STAGE[status]

  const steps = STAGES.map((stage) => {
    const entry = [...round].reverse().find((h) => h.stage === stage)
    if (entry) {
      const word = stage === 'LECTURER' ? '' : `${DECISION_LABEL[entry.decision]} `
      return { stage, text: `${word}${formatDate(entry.decided_at)}`, state: entry.decision.toLowerCase() }
    }
    if (stage === current) return { stage, text: 'Current', state: 'current' }
    return { stage, text: 'Pending', state: 'pending' }
  })

  return (
    <section className="panel panel-soft trail">
      <h3 className="panel-title">Approval history · Fixed order, no stages skipped</h3>
      <ol className="trail-steps">
        {steps.map((s) => (
          <li key={s.stage} className={`trail-step trail-${s.state}`}>
            <strong>{STAGE_LABEL[s.stage]}</strong> · {s.text}
          </li>
        ))}
      </ol>

      {history.length > 0 && (
        <details className="trail-log">
          <summary className="small">Show full decision log ({history.length})</summary>
          <table className="table">
            <thead><tr><th>Date</th><th>Stage</th><th>Decision</th><th>By</th><th>Comment</th></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{formatDate(h.decided_at)}</td>
                  <td>{STAGE_LABEL[h.stage]}</td>
                  <td>{DECISION_LABEL[h.decision]}</td>
                  <td>{h.decided_by}{h.acting_for && <span className="small muted"> (acting for {h.acting_for})</span>}</td>
                  <td className="pre-wrap">{h.comment || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  )
}
