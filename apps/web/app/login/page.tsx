'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signIn, useSession } from 'next-auth/react'
import { useState, useEffect } from 'react'

export default function LoginPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [maintenance, setMaintenance] = useState(false)

  useEffect(() => {
    if (session) {
      router.replace('/dashboard')
    }
  }, [session, router])

  useEffect(() => {
    fetch('/api/maintenance')
      .then((r) => r.json())
      .then((d) => {
        if (
          d.data?.enabled &&
          (Array.isArray(d.data.scope) ? d.data.scope : [d.data.scope]).includes('all')
        ) {
          setMaintenance(true)
        }
      })
      .catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setIsPending(true)

    const formData = new FormData(e.currentTarget)
    const email = formData.get('email') as string
    const password = formData.get('password') as string

    if (!email || !password) {
      setError('Email and password are required')
      setIsPending(false)
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      setIsPending(false)
      return
    }

    try {
      // Check email confirmation first (non-blocking on error)
      try {
        const checkRes = await fetch('/api/auth/check-confirmed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        })
        if (checkRes.ok) {
          const checkData = await checkRes.json()
          if (checkData.confirmed === false) {
            setError('Please confirm your email first. Check your inbox.')
            setIsPending(false)
            return
          }
        }
      } catch {
        // If check-confirmed fails, proceed with login anyway
        // The authorize callback will handle validation
      }

      // Client-side signIn handles CSRF automatically
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        setError('Invalid email or password')
        setIsPending(false)
        return
      }

      // Fire-and-forget: session tracking + logging
      fetch('/api/auth/post-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      }).catch(() => {})

      router.push('/dashboard')
    } catch {
      setError('Something went wrong. Please try again.')
      setIsPending(false)
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
            <h1 className="text-lg font-semibold text-white">Login</h1>
            <p className="text-sm text-gray-500 mt-1">
              Enter your credentials to access your account
            </p>
          </div>

          {maintenance && (
            <div
              className="mb-4 rounded-xl p-3 text-sm"
              style={{
                background: 'rgba(245,158,11,0.1)',
                color: '#f59e0b',
                border: '1px solid rgba(245,158,11,0.2)',
              }}
            >
              System is under maintenance. Please try again later.
            </div>
          )}

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

            <div className="flex items-center justify-between text-sm">
              <Link href="/login/reset" className="text-blue-400 hover:text-blue-300 transition-colors">
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 transition-colors"
            >
              {isPending ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-4">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="text-blue-400 hover:text-blue-300 transition-colors">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
