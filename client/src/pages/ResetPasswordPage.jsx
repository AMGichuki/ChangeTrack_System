// "Choose a new password" screen. The person arrives here from the link in the email:
//   /reset-password?token=...
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../services/api'
import AuthLayout from '../components/AuthLayout'
import PasswordInput from '../components/PasswordInput'

// Same rule as the server: 8+ characters, at least one letter and one number.
function passwordProblem(password) {
  if (password.length < 8) return 'Use at least 8 characters.'
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'Use at least one letter and one number.'
  return null
}

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const problem = passwordProblem(password)
    if (problem) return setError(problem)
    if (password !== confirm) return setError('The two passwords do not match.')

    setBusy(true)
    try {
      const data = await api.resetPassword(token, password)
      navigate('/signin', { replace: true, state: { info: data.message } })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (!token) {
    return (
      <AuthLayout>
        <div className="signin-form">
          <h2>Reset link missing</h2>
          <p className="muted">Please open the link from your email again, or ask for a new one.</p>
          <Link to="/forgot-password" className="btn-yellow btn-link">Ask for a new link</Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <form className="signin-form" onSubmit={handleSubmit}>
        <h2>Choose a new password</h2>
        <p className="muted">At least 8 characters, with at least one letter and one number.</p>

        <label htmlFor="password">New password</label>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <label htmlFor="confirm">Type it again</label>
        <PasswordInput
          id="confirm"
          name="confirm"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />

        {error && (
          <p className="error" role="alert">
            {error}{' '}
            {error.includes('link') && <Link to="/forgot-password">Ask for a new link</Link>}
          </p>
        )}

        <button type="submit" className="btn-yellow spaced-top" disabled={busy}>
          {busy ? 'Saving…' : 'Save new password'}
        </button>
        <p className="muted small">After saving, you will be signed out on all other devices.</p>
      </form>
    </AuthLayout>
  )
}
