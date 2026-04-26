'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function ConfirmResetPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const [checking, setChecking] = useState(true)
  const tokenRef = useRef<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')

    if (token) {
      tokenRef.current = token
      setSessionReady(true)
      window.history.replaceState({}, '', '/login/reset/confirm')
    }
    setChecking(false)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (!tokenRef.current) {
      setError('Invalid or expired reset link. Please request a new one.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenRef.current, password }),
      })
      const data = await res.json()

      if (!data.success) {
        setError(data.error || 'Failed to update password')
      } else {
        setSuccess(true)
        tokenRef.current = null
        // Redirect to login after 3 seconds
        setTimeout(() => router.push('/login'), 3000)
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to update password'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ background: 'var(--deep-space, #0a0a0a)' }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <span className="text-lg font-bold text-white tracking-tight">
            Cobain
          </span>
        </div>

        <div
          className="rounded-2xl p-6"
          style={{
            background: 'var(--surface-1, #111113)',
            border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
          }}
        >
          <h1 className="text-lg font-semibold text-white mb-1">
            Set New Password
          </h1>
          <p
            className="text-sm mb-6"
            style={{ color: 'var(--text-muted, #55566a)' }}
          >
            Enter your new password below
          </p>

          {checking ? (
            <div
              className="flex items-center justify-center py-8 gap-2"
              style={{ color: 'var(--text-muted)' }}
            >
              <Loader2 className="size-4 animate-spin" />
              <span className="text-sm">Verifying reset link...</span>
            </div>
          ) : !sessionReady ? (
            <div className="py-4">
              <div
                className="rounded-xl p-3 text-sm"
                style={{
                  background: 'rgba(244,63,94,0.1)',
                  color: 'var(--rose, #f43f5e)',
                }}
              >
                Invalid or expired reset link. Please request a new one.
              </div>
              <a
                href="/login"
                className="block mt-4 text-center text-sm"
                style={{ color: 'var(--q-accent)' }}
              >
                Back to Login
              </a>
            </div>
          ) : success ? (
            <div className="py-4 text-center">
              <div
                className="rounded-xl p-3 text-sm mb-4"
                style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}
              >
                Password updated successfully!
              </div>
              <p
                className="text-xs"
                style={{ color: 'var(--text-muted)' }}
              >
                Redirecting to login...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div
                  className="rounded-xl p-3 text-sm"
                  style={{
                    background: 'rgba(244,63,94,0.1)',
                    color: 'var(--rose)',
                  }}
                >
                  {error}
                </div>
              )}
              <div>
                <label
                  className="block text-xs mb-1.5"
                  style={{ color: 'var(--text-muted)' }}
                >
                  New Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="w-full px-4 py-2.5 rounded-xl text-white placeholder:text-gray-600"
                  style={{
                    background: 'var(--surface-2, #1a1a1f)',
                    border: '1px solid var(--border-subtle)',
                  }}
                />
              </div>
              <div>
                <label
                  className="block text-xs mb-1.5"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="w-full px-4 py-2.5 rounded-xl text-white placeholder:text-gray-600"
                  style={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border-subtle)',
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl font-medium text-sm text-black disabled:opacity-50"
                style={{ background: 'var(--q-accent, #00f5d4)' }}
              >
                {loading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
