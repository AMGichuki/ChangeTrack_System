// Keeps "who is signed in" in one place, so every page can use it.
import { useCallback, useEffect, useState } from 'react'
import { AuthContext } from './authContext'
import { api, clearSession, getSession, saveSession, setRememberedEmail } from '../services/api'


export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // "loading" is true only if there is a saved session we still need to check.
  const [loading, setLoading] = useState(() => Boolean(getSession()))

  // When the app opens, check if a saved session is still valid.
  useEffect(() => {
    if (!getSession()) return
    api.me()
      .then((data) => setUser(data.user))
      .catch(() => clearSession())
      .finally(() => setLoading(false))
  }, [])

  // If the session ends while using the app, go back to sign in.
  useEffect(() => {
    const onSignedOut = () => setUser(null)
    window.addEventListener('changetrack:signed-out', onSignedOut)
    return () => window.removeEventListener('changetrack:signed-out', onSignedOut)
  }, [])

  const login = useCallback(async (email, password, remember = false) => {
    const data = await api.login(email, password)
    saveSession(data.session, remember)
    setRememberedEmail(remember ? email.trim() : '')
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(async () => {
    await api.logout().catch(() => {}) // sign out locally even if the server is unreachable
    clearSession()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
