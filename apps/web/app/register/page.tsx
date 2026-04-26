'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Turnstile } from '@marsidev/react-turnstile'
import { Wrench } from 'lucide-react'
import { useSession } from 'next-auth/react'

export default function RegisterPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const [loading, setLoading] = useState(true)
  const [maintenance, setMaintenance] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [turnstileToken, setTurnstileToken] = useState('')
  const [registered, setRegistered] = useState(false)

  useEffect(() => {
    if (session) {
      router.replace('/dashboard')
    }
  }, [session, router])

  useEffect(() => {
    fetch('/api/maintenance')
      .then((r) => r.json())
      .then((d) => {
        const scope = Array.isArray(d.data?.scope) ? d.data.scope : [d.data?.scope]
        if (d.data?.enabled && scope.includes('all')) {
          setMaintenance(true)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setIsPending(true)

    const formData = new FormData(e.currentTarget)
    const email = formData.get('email') as string
    const password = formData.get('password') as string
    const confirmPassword = formData.get('confirmPassword') as string

    if (!email || !password || !confirmPassword) {
      setError('All fields are required')
      setIsPending(false)
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address')
      setIsPending(false)
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      setIsPending(false)
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setIsPending(false)
      return
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, turnstileToken }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error || 'Registration failed')
        setIsPending(false)
        return
      }
      // Show "check your email" message instead of redirecting
      setRegistered(true)
      setIsPending(false)
    } catch {
      setError('Something went wrong. Please try again.')
      setIsPending(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a0a' }}>
        <div
          className="size-6 border-2 rounded-full animate-spin"
          style={{ borderColor: 'var(--border-subtle)', borderTopColor: 'var(--q-accent)' }}
        />
      </div>
    )
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
          {registered ? (
            <div className="text-center py-8">
              <div className="size-12 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(0,245,212,0.1)' }}>
                <svg className="size-6" style={{ color: '#00f5d4' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-white">Check Your Email</h2>
              <p className="text-sm mt-2" style={{ color: '#8a8b9e' }}>
                We sent a confirmation link to your email. Please confirm your email to activate your account.
              </p>
              <p className="text-xs mt-3" style={{ color: '#55566a' }}>
                Link expires in 24 hours. Check your spam folder if you don&apos;t see it.
              </p>
              <Link
                href="/login"
                className="inline-block mt-4 text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                Back to Login
              </Link>
            </div>
          ) : maintenance ? (
            <div className="text-center py-8">
              <Wrench className="size-8 mx-auto mb-3" style={{ color: '#f59e0b' }} />
              <h2 className="text-lg font-semibold text-white">Registration Unavailable</h2>
              <p className="text-sm mt-2" style={{ color: '#8a8b9e' }}>
                System is under maintenance. Please try again later.
              </p>
              <Link
                href="/login"
                className="inline-block mt-4 text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                Back to Login
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h1 className="text-lg font-semibold text-white">Create Account</h1>
                <p className="text-sm text-gray-500 mt-1">
                  Sign up to get started with Cobain
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium text-gray-300">
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

                <div className="space-y-2">
                  <label htmlFor="password" className="text-sm font-medium text-gray-300">
                    Password
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="••••••••"
                    required
                    className="w-full rounded-lg border border-gray-800 bg-gray-800/50 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-colors"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="confirmPassword" className="text-sm font-medium text-gray-300">
                    Confirm Password
                  </label>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    placeholder="••••••••"
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
                  disabled={isPending || !turnstileToken}
                  className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 transition-colors"
                >
                  {isPending ? 'Creating account...' : 'Create Account'}
                </button>
              </form>

              <p className="text-center text-sm text-gray-500 mt-4">
                Already have an account?{' '}
                <Link href="/login" className="text-blue-400 hover:text-blue-300 transition-colors">
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
