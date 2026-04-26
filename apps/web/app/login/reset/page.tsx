'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Turnstile } from '@marsidev/react-turnstile'

export default function ResetPasswordPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState('')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const email = formData.get('email') as string

    if (!email) {
      setError('Email is required')
      setLoading(false)
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address')
      setLoading(false)
      return
    }

    try {
      // Send reset email via server API (service role, no PKCE)
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, turnstileToken }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error || 'Failed to send reset link')
        setLoading(false)
        return
      }

      setSuccess(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <span className="text-lg font-bold text-white tracking-tight">
            Cobain
          </span>
        </div>

        {/* Card */}
        <div className="bg-gray-900/80 border border-gray-800/60 rounded-xl p-6">
          <div className="mb-6">
            <h1 className="text-lg font-semibold text-white">Reset Password</h1>
            <p className="text-sm text-gray-500 mt-1">
              Enter your email to receive a password reset link
            </p>
          </div>

          {success ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3 text-sm text-green-400">
                Check your email for a reset link
              </div>
              <Link
                href="/login"
                className="block text-center text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                Back to login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className="text-sm font-medium text-gray-300"
                >
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  required
                  className="w-full rounded-lg border border-gray-800 bg-gray-800/50 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-colors"
                />
              </div>

              <div className="mb-4">
                <Turnstile
                  siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '1x00000000000000000000AA'}
                  onSuccess={(token) => setTurnstileToken(token)}
                  onError={() => setTurnstileToken('')}
                  onExpire={() => setTurnstileToken('')}
                  options={{
                    theme: 'dark',
                    size: 'normal',
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={!turnstileToken || loading}
                className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 transition-colors"
              >
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>

              <Link
                href="/login"
                className="block text-center text-sm text-gray-500 hover:text-gray-400 transition-colors"
              >
                Back to login
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
