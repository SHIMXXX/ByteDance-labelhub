import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { UserRole } from '../types/domain'
import { getAuthToken, onAuthExpired, onAuthSync } from '../services/api/client'
import { roleHomePath } from './roleMenus'

type RoleGuardProps = {
  role: UserRole
  children: ReactNode
}

export function RoleGuard({ role, children }: RoleGuardProps) {
  const [token, setToken] = useState(() => getAuthToken())

  useEffect(() => {
    const sync = () => setToken(getAuthToken())
    const cleanupExpired = onAuthExpired(() => setToken(''))
    const cleanupSync = onAuthSync(sync)
    return () => {
      cleanupExpired()
      cleanupSync()
    }
  }, [])

  if (!token) {
    return <Navigate to="/" replace />
  }

  const savedRole = window.localStorage.getItem('labelhub_role') as UserRole | null
  if (savedRole && savedRole !== role) {
    return <Navigate to={roleHomePath[savedRole]} replace />
  }

  return <>{children}</>
}
