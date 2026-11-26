// Frame for staff screens: dark blue top bar + left menu (from our wireframes).
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { ROLE_LABEL, ROLE_MENU } from '../config/roles'
import TopbarUser from './TopbarUser'

export default function StaffLayout() {
  const { user, logout } = useAuth()
  // While someone is acting for an approver today, they get an extra link.
  const actingMenu = (user.acting || []).map((a) => ({
    to: `/acting/${a.approver_id}`,
    label: `Acting ${ROLE_LABEL[a.role]} · ${a.approver_name}`,
  }))
  const menu = [...(ROLE_MENU[user.role] || []), ...actingMenu]

  return (
    <div className="staff-layout">
      <header className="topbar">
        <span className="brand">CHANGETRACK</span>
        <span className="topbar-title">Grade change workflow</span>
        <TopbarUser name={user.full_name} role={user.job_title || ROLE_LABEL[user.role]} onSignOut={logout} />
      </header>

      <aside className="sidebar">
        <p className="sidebar-role">{ROLE_LABEL[user.role].toUpperCase()}</p>
        <nav>
          {menu.map((item) => (
            <NavLink key={item.to} to={item.to} end className="sidebar-link">
              {item.label}
            </NavLink>
          ))}
        </nav>
        <p className="sidebar-footer">USIU-Africa<br />School grade changes</p>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
