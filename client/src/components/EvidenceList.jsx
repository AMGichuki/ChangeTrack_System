// "Private evidence" box. Each file opens through a 60-second signed link that
// our server only gives to people allowed to see this request.
import { useState } from 'react'
import { api } from '../services/api'

export default function EvidenceList({ requestId, evidence }) {
  const [error, setError] = useState('')

  async function viewFile(file) {
    setError('')
    // Open the tab straight away (on the click), otherwise the browser may block it as a pop-up.
    const tab = window.open('', '_blank')
    try {
      const { url } = await api.openEvidence(requestId, file.id)
      if (tab) {
        tab.opener = null
        tab.location.href = url
      } else {
        window.location.href = url
      }
    } catch (err) {
      if (tab) tab.close()
      setError(err.message)
    }
  }

  return (
    <section className="panel panel-soft evidence-panel">
      <h3 className="panel-title">Private evidence</h3>
      {evidence.length === 0 && <p className="small muted">No files attached.</p>}
      {evidence.map((file) => (
        <div key={file.id} className="evidence-row">
          <span className="small">{file.file_name}</span>
          <button type="button" className="btn-outline" onClick={() => viewFile(file)}>View file</button>
        </div>
      ))}
      {error && <p className="error">{error}</p>}
    </section>
  )
}
