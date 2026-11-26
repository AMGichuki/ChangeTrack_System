// Sign in screen (wireframe page 1).
import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { ROLE_HOME } from '../config/roles'
import AuthLayout from '../components/AuthLayout'
import PasswordInput from '../components/PasswordInput'
import { getRememberedEmail } from '../services/api'

export default function SignInPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // If they ticked "Keep me signed in" last time, their email is filled in already.
  const [email, setEmail] = useState(getRememberedEmail)
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(() => Boolean(getRememberedEmail()))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Message passed from the Reset password page, e.g. "Your password has been changed".
  const info = location.state?.info

  // Already signed in? Go straight to your own screen.
  if (user) return <Navigate to={ROLE_HOME[user.role]} replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const signedIn = await login(email, password, remember)
      navigate(ROLE_HOME[signedIn.role], { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout>
      <form className="signin-form" onSubmit={handleSubmit}>
        <h2>Sign in</h2>
        <p className="muted">Use your ChangeTrack account to continue.</p>

        {info && <p className="note note-success" role="status">{info}</p>}

        <label htmlFor="email">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder="you@gmail.com"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <label htmlFor="password">Password</label>
        <PasswordInput
          id="password"
          placeholder="Enter your password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <div className="signin-options">
          <label className="remember">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Keep me signed in on this computer
          </label>
          <Link to="/forgot-password" className="forgot">Forgot password?</Link>
        </div>

        {error && <p className="error" role="alert">{error}</p>}

        <button type="submit" className="btn-yellow" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="muted small">
          Accounts are created by the administrator.<br />
          Need access? Contact your school administrator.
        </p>
      </form>
    </AuthLayout>
  )
}
