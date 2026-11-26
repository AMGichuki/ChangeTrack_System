// Frame for the student screen: simple and phone-friendly, no menu.
import { Outlet } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import TopbarUser from './TopbarUser'

export default function StudentLayout() {
  const { user, logout } = useAuth()

  return (
    <div className="student-layout">
      <header className="topbar">
        <span className="brand">CHANGETRACK</span>
        <TopbarUser name={user.full_name} role="Student" onSignOut={logout} />
      </header>
      <main className="student-content">
        <Outlet />
      </main>
    </div>
  )
}
