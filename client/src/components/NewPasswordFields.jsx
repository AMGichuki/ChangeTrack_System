// "Password" + "Confirm password" boxes used when the Admin creates an account
// or sets a new password. The text is hidden (dots), and the password is never
// shown again anywhere in ChangeTrack.
export default function NewPasswordFields({ value, onChange, label = 'Password' }) {
  const update = (e) => onChange({ ...value, [e.target.name]: e.target.value })
  return (
    <>
      <label className="field">
        <span>{label} *</span>
        <input type="password" name="password" autoComplete="new-password" placeholder="8+ characters, letters and numbers"
          value={value.password} onChange={update} required />
      </label>
      <label className="field">
        <span>Confirm {label.toLowerCase()} *</span>
        <input type="password" name="confirm" autoComplete="new-password" placeholder="Type it again"
          value={value.confirm} onChange={update} required />
      </label>
    </>
  )
}
