// A simple horizontal bar chart: one bar per row, with the number always shown.
// One series only, so the panel title names it (no legend needed).
// Colours were checked with a contrast/colour-blindness validator; the number
// beside every bar means nobody has to rely on the colour alone.
export default function BarList({ title, rows, color }) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  const total = rows.reduce((sum, r) => sum + r.count, 0)

  return (
    <section className="panel">
      <h2 className="panel-title">{title}</h2>
      {rows.length === 0 && <p className="small muted">No requests yet.</p>}
      <ul className="bar-list">
        {rows.map((r) => {
          const share = total ? Math.round((r.count / total) * 100) : 0
          return (
            <li key={r.label} className="bar-row" title={`${r.label}: ${r.count} request${r.count === 1 ? '' : 's'} (${share}%)`}>
              <span className="bar-label">{r.label}</span>
              <span className="bar-track">
                <span
                  className="bar-fill"
                  style={{ width: r.count ? `max(4px, ${(r.count / max) * 100}%)` : 0, background: color }}
                />
              </span>
              <span className="bar-value">{r.count}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
