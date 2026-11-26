// Only lets someone see a page if they are signed in AND have the right role.
// Note: this is for a good user experience only. The real security check is
// on the server (requireAuth / requireRole), because browser code can be changed.
//
// allowActing: also let in someone who is ACTING for one of these roles today
// (used only by the /acting/:approverId page).
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { ROLE_HOME } from '../config/roles'

export default function ProtectedRoute({ roles, allowActing = false }) {
  const { user, loading } = useAuth()

  if (loading) return <p className="loading">Loading…</p>
  if (!user) return <Navigate to="/signin" replace />

  const hasRole = !roles || roles.includes(user.role)
  const isActing = allowActing && (user.acting || []).some((a) => roles.includes(a.role))
  if (!hasRole && !isActing) {
    return <Navigate to={ROLE_HOME[user.role]} replace />
  }
  return <Outlet />
}
