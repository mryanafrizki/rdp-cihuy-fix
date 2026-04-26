'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'

const features = [
  {
    title: 'Automated Setup',
    desc: 'One-click Windows RDP installation with real-time progress monitoring.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 2L3 7v6l7 5 7-5V7l-7-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M10 12V8m0 0L7.5 9.5M10 8l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Multi-OS Library',
    desc: 'Windows 7 to Server 2025, AtlasOS, Ghost Spectre, UEFI, and Lite variants.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="3" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="11" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="3" y="11" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="11" y="11" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    title: 'Instant Payment',
    desc: 'Pay via QRIS with automatic balance top-up. No manual verification needed.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 6v4l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
]

export default function HomePage() {
  const { data: session } = useSession()
  const [osCount, setOsCount] = useState(25)
  const [maintenanceNote, setMaintenanceNote] = useState('')
  const user = session?.user ? { email: session.user.email || '' } : null

  useEffect(() => {
    fetch('/api/public/os-versions')
      .then((r) => r.json())
      .then((d) => {
        const enabled = (d.data || []).filter((v: Record<string, unknown>) => v.enabled !== false)
        if (enabled.length > 0) setOsCount(enabled.length)
      })
      .catch(() => {})
    fetch('/api/maintenance').then(r => r.json()).then(d => {
      const scope = Array.isArray(d.data?.scope) ? d.data.scope : [d.data?.scope]
      if (d.data?.enabled && scope.includes('all')) {
        setMaintenanceNote(d.data.note || 'System is under maintenance. Please check back later.')
      }
    }).catch(() => {})
  }, [])

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/login' })
  }

  return (
    <div className="min-h-screen relative" style={{ background: '#0a0a0a' }}>
      {/* Animated gradient background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none" style={{ background: '#0a0a0a' }}>
        <div
          className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-20 blur-3xl animate-pulse"
          style={{ background: 'radial-gradient(circle, #00f5d4 0%, transparent 70%)' }}
        />
        <div
          className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full opacity-10 blur-3xl animate-pulse"
          style={{
            background: 'radial-gradient(circle, #c026d3 0%, transparent 70%)',
            animationDelay: '2s',
            animationDuration: '4s',
          }}
        />
        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10">
        {/* Maintenance Banner */}
        {maintenanceNote && (
          <div className="w-full py-3 px-4 text-center text-sm" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', borderBottom: '1px solid rgba(245,158,11,0.15)' }}>
            {maintenanceNote}
          </div>
        )}

        {/* Nav */}
        <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
          <div className="text-lg font-bold text-white tracking-tight">Cobain</div>
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <span className="text-xs hidden sm:inline" style={{ color: 'var(--text-muted)' }}>{user.email}</span>
                <Link href="/dashboard" className="text-sm px-4 py-2 rounded-xl font-medium transition-all hover:opacity-90"
                  style={{ background: 'var(--q-accent, #00f5d4)', color: '#000' }}>
                  Dashboard
                </Link>
                <button onClick={handleLogout} className="text-sm px-3 py-2 rounded-xl transition-all hover:bg-white/5"
                  style={{ color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm px-4 py-2 rounded-xl transition-colors"
                  style={{ color: 'var(--text-secondary, #8a8b9e)' }}
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  className="text-sm px-4 py-2 rounded-xl font-medium"
                  style={{ background: 'var(--q-accent, #00f5d4)', color: '#000' }}
                >
                  Get Started
                </Link>
              </>
            )}
          </div>
        </nav>

        {/* Hero */}
        <div className="max-w-4xl mx-auto px-6 pt-24 pb-16 text-center">
          <div
            className="inline-block px-3 py-1 rounded-full text-xs font-medium mb-6"
            style={{
              background: 'rgba(0,245,212,0.08)',
              color: 'var(--q-accent)',
              border: '1px solid rgba(0,245,212,0.15)',
            }}
          >
            Cloud RDP Infrastructure
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold text-white tracking-tight leading-tight">
            Deploy Windows RDP
            <br />
            <span style={{ color: 'var(--q-accent, #00f5d4)' }}>in minutes</span>
          </h1>
          <p className="mt-6 text-lg max-w-2xl mx-auto" style={{ color: 'var(--text-secondary, #8a8b9e)' }}>
            Automated Windows RDP installation on any KVM VPS. Choose from {osCount}+ Windows versions, pay with QRIS,
            and monitor installation in real-time.
          </p>
          <div className="flex items-center justify-center gap-4 mt-10">
            {user ? (
              <Link
                href="/dashboard"
                className="px-8 py-3.5 rounded-2xl text-sm font-semibold transition-all hover:scale-105"
                style={{ background: 'var(--q-accent)', color: '#000' }}
              >
                Go to Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/register"
                  className="px-8 py-3.5 rounded-2xl text-sm font-semibold transition-all hover:scale-105"
                  style={{ background: 'var(--q-accent)', color: '#000' }}
                >
                  Start Installing
                </Link>
                <Link
                  href="/login"
                  className="px-8 py-3.5 rounded-2xl text-sm font-medium transition-all"
                  style={{
                    background: 'var(--surface-1, #111113)',
                    color: 'white',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  Sign In
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Features */}
        <div className="max-w-5xl mx-auto px-6 py-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <div
                key={i}
                className="group rounded-2xl p-6 transition-all duration-300 hover:translate-y-[-2px]"
                style={{
                  background: 'var(--surface-1, #111113)',
                  border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(0,245,212,0.2)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-subtle, rgba(255,255,255,0.06))'
                }}
              >
                <div
                  className="size-10 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: 'rgba(0,245,212,0.08)', color: 'var(--q-accent)' }}
                >
                  {f.icon}
                </div>
                <h3 className="text-sm font-semibold text-white">{f.title}</h3>
                <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--text-muted, #55566a)' }}>
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-8 max-w-3xl mx-auto text-center py-16 px-6">
          <div>
            <div className="text-3xl font-bold text-white">{osCount}+</div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              OS Versions
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white">QRIS</div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Instant Payment
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white">24/7</div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Automated
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="max-w-6xl mx-auto px-6 py-8 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>Cobain.dev</span>
            <span>Powered by Cloudflare Workers</span>
          </div>
        </div>
      </div>
    </div>
  )
}
