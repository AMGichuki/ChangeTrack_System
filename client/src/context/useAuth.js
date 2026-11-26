// Any page can call useAuth() to get { user, loading, login, logout }.
import { useContext } from 'react'
import { AuthContext } from './authContext'

export function useAuth() {
  return useContext(AuthContext)
}
