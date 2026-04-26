'use server'

import { logActivity } from '@/lib/activity-logger'
import { getServerActionInfo } from '@/lib/request-info'

// requestReset removed - now handled by /api/auth/forgot-password route

export async function confirmReset(
  _prevState: { error?: string; success?: boolean } | null | undefined,
  formData: FormData
) {
  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirmPassword') as string
  const token = formData.get('token') as string

  if (!password || !confirmPassword) {
    return { error: 'Both fields are required' }
  }

  if (password.length < 6) {
    return { error: 'Password must be at least 6 characters' }
  }

  if (password !== confirmPassword) {
    return { error: 'Passwords do not match' }
  }

  if (!token) {
    return { error: 'Invalid or expired reset link' }
  }

  // Call the reset-confirm API route
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const res = await fetch(`${siteUrl}/api/auth/reset-confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
  })
  const data = await res.json()

  if (!data.success) {
    return { error: data.error || 'Failed to update password' }
  }

  // Log password reset (fire-and-forget)
  getServerActionInfo().then((info) =>
    logActivity({
      action: 'reset_password',
      userId: data.userId || '',
      email: data.email || '',
      ...info,
    })
  ).catch(() => {})

  return { success: true }
}
