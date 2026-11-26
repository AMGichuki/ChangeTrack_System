// Right side of the top bar: initials in a circle, the person's name and role,
// and a Sign out button.
export default function TopbarUser({ name, role, onSignOut }) {
  const initials = String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')

  return (
    <div className="topbar-user">
      <span className="avatar" aria-hidden="true">{initials}</span>
      <span className="topbar-who">
        <span className="topbar-name">{name}</span>
        <span className="topbar-role">{role}</span>
      </span>
      <button type="button" className="signout-btn" onClick={onSignOut}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" />
        </svg>
        Sign out
      </button>
    </div>
  )
}
