'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState, Suspense } from 'react'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'

function ConfirmContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setMessage('Invalid confirmation link.')
      return
    }

    fetch(`/api/auth/confirm-email?token=${token}`, { redirect: 'manual' })
      .then((res) => {
        if (res.type === 'opaqueredirect' || res.status === 307 || res.status === 308 || res.status === 302) {
          setStatus('success')
          setMessage('Email confirmed! Redirecting to dashboard...')
          setTimeout(() => {
            window.location.href = '/dashboard'
          }, 2000)
        } else {
          setStatus('error')
          setMessage('Invalid or expired confirmation link.')
        }
      })
      .catch(() => {
        setStatus('error')
        setMessage('Something went wrong. Please try again.')
      })
  }, [token])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0c' }}>
      <div style={{ textAlign: 'center', maxWidth: '400px', padding: '32px' }}>
        {status === 'loading' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Loader2 style={{ width: '32px', height: '32px', color: '#3b82f6', animation: 'spin 1s linear infinite' }} />
            </div>
            <p style={{ color: '#8a8b9e', fontFamily: '-apple-system, sans-serif', fontSize: '14px' }}>Confirming your email...</p>
          </div>
        )}
        {status === 'success' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(0,245,212,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 style={{ width: '32px', height: '32px', color: '#00f5d4' }} />
            </div>
            <div>
              <h2 style={{ color: '#e4e4e7', fontFamily: '-apple-system, sans-serif', fontSize: '18px', fontWeight: 600, margin: '0 0 8px' }}>Email Confirmed!</h2>
              <p style={{ color: '#00f5d4', fontFamily: '-apple-system, sans-serif', fontSize: '14px', margin: 0 }}>{message}</p>
            </div>
          </div>
        )}
        {status === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <XCircle style={{ width: '32px', height: '32px', color: '#ef4444' }} />
            </div>
            <div>
              <h2 style={{ color: '#e4e4e7', fontFamily: '-apple-system, sans-serif', fontSize: '18px', fontWeight: 600, margin: '0 0 8px' }}>Confirmation Failed</h2>
              <p style={{ color: '#ef4444', fontFamily: '-apple-system, sans-serif', fontSize: '14px', margin: 0 }}>{message}</p>
            </div>
            <a href="/login" style={{ color: '#3b82f6', fontFamily: '-apple-system, sans-serif', fontSize: '14px', textDecoration: 'none', marginTop: '8px' }}>
              Back to Login
            </a>
          </div>
        )}
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0c' }}>
        <p style={{ color: '#8a8b9e', fontFamily: '-apple-system, sans-serif' }}>Loading...</p>
      </div>
    }>
      <ConfirmContent />
    </Suspense>
  )
}
