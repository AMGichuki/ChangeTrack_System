// A temporary page for screens we build in later sprints.
// It shows the right title for each role, so we can test login and menus now.
import { useAuth } from '../context/useAuth'

export default function PlaceholderPage({ title, subtitle, sprint }) {
  const { user } = useAuth()

  return (
    <div>
      <h1 className="page-title">{title}</h1>
      {subtitle && <p className="muted">{subtitle}</p>}

      <div className="note-box">
        <p><strong>Signed in as {user.full_name}</strong>
          {user.department_name && <> · {user.department_name}</>}
          {user.student_number && <> · {user.student_number}</>}
        </p>
        <p>This screen is built in <strong>Sprint {sprint}</strong>.</p>
      </div>
    </div>
  )
}
