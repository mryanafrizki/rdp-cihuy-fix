import { auth } from './auth-config'
import { redirect } from 'next/navigation'

export async function getCurrentUser() {
  const session = await auth()
  if (!session?.user) return null
  return session.user
}

export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

export async function requireAdmin() {
  const user = await requireAuth()
  if (user.role !== 'admin' && user.role !== 'super_admin') redirect('/dashboard')
  return user
}
