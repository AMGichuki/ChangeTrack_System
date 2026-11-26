// "Forgot password" screen: the person types their email and we send a reset link.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import AuthLayout from '../components/AuthLayout'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sentMessage, setSentMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const data = await api.forgotPassword(email)
      setSentMessage(data.message)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout>
      <form className="signin-form" onSubmit={handleSubmit}>
        <h2>Forgot password</h2>
        <p className="muted">Enter your school email address. We will send you a link to choose a new password.</p>

        {sentMessage ? (
          <>
            <p className="note note-success" role="status">{sentMessage}</p>
            <p className="muted small">The link works once and expires in 1 hour. Check your spam folder if you cannot see it.</p>
          </>
        ) : (
          <>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              placeholder="you@gmail.com"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            {error && <p className="error" role="alert">{error}</p>}

            <button type="submit" className="btn-yellow spaced-top" disabled={busy}>
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
          </>
        )}

        <Link to="/signin" className="back-link">← Back to sign in</Link>
      </form>
    </AuthLayout>
  )
}
