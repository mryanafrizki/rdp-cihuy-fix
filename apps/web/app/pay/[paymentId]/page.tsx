'use client'

import { useState, useEffect, useRef, use } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import QRCode from 'qrcode'
import { Copy, Check, Clock, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'

function RedirectCountdown({ to, seconds }: { to: string, seconds: number }) {
  const [count, setCount] = useState(seconds);

  useEffect(() => {
    if (count <= 0) {
      window.location.href = to;
      return;
    }
    const t = setTimeout(() => setCount(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count, to]);

  return (
    <p className="mt-4 text-xs" style={{ color: 'var(--text-muted, #55566a)' }}>
      Redirecting... {count}s
    </p>
  );
}

export default function PaymentPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = use(params)
  const [payment, setPayment] = useState<any>(null)
  const [notFound, setNotFound] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [timeLeft, setTimeLeft] = useState(900) // 15 min max
  const [showConfetti, setShowConfetti] = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const [terminal, setTerminal] = useState(false) // once true, stop all polling/updates
  const terminalRef = useRef(false) // ref for use inside async closures

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/pay/${paymentId}` : ''

  // Check if user has an active session (for showing/hiding cancel button)
  useEffect(() => {
    fetch('/api/auth/session').then(r => r.json()).then(d => {
      if (d?.user?.id) setHasSession(true)
    }).catch(() => {})
  }, [])

  // Fetch initial payment data (public endpoint for QR), then poll authenticated status
  useEffect(() => {
    let interval: NodeJS.Timeout
    let initialFetched = false
    let retryCount = 0

    const fetchInitial = async () => {
      try {
        const res = await fetch(`/api/pay/${paymentId}`)
        if (res.status === 404) {
          setNotFound(true)
          return
        }
        const data = await res.json()
        if (data.success) {
          setPayment(data.data)
          if (data.data.qr_string) {
            QRCode.toDataURL(data.data.qr_string, { width: 300, margin: 2 })
              .then(url => setQrDataUrl(url)).catch(() => {})
          }
          initialFetched = true
          // If already terminal, don't start polling
          if (data.data.status === 'completed') {
            setShowConfetti(true)
            setTerminal(true)
            terminalRef.current = true
            return
          }
          if (['failed', 'cancelled', 'expired'].includes(data.data.status)) {
            setTerminal(true)
            terminalRef.current = true
            return
          }
          // Start polling via authenticated endpoint (triggers balance credit)
          startPolling()
        } else {
          // API returned success: false
          retryCount++
          if (retryCount >= 3) {
            setNotFound(true)
          } else {
            setTimeout(fetchInitial, 2000)
          }
        }
      } catch {
        // Retry initial fetch (max 3 times)
        retryCount++
        if (retryCount >= 3) {
          setNotFound(true)
        } else {
          setTimeout(fetchInitial, 2000)
        }
      }
    }

    const pollStatus = async () => {
      // Don't poll if already in terminal state (expired/cancelled/failed/completed)
      if (terminalRef.current) {
        clearInterval(interval)
        return
      }

      try {
        // Try authenticated endpoint first (triggers balance credit)
        const authRes = await fetch(`/api/topup/status?transaction_id=${paymentId}`)
        if (authRes.ok) {
          const data = await authRes.json()
          if (data.success && data.data) {
            const status = data.data.status
            if (terminalRef.current) return // double-check after await
            setPayment((prev: any) => prev ? { ...prev, status } : prev)
            if (status === 'completed') {
              setShowConfetti(true)
              setTerminal(true)
              terminalRef.current = true
              clearInterval(interval)
            }
            if (['failed', 'cancelled', 'expired'].includes(status)) {
              setTerminal(true)
              terminalRef.current = true
              clearInterval(interval)
            }
            return
          }
        }

        // Fallback to public endpoint (for cross-device / unauthenticated)
        if (terminalRef.current) return
        const pubRes = await fetch(`/api/pay/${paymentId}`)
        if (pubRes.ok) {
          const data = await pubRes.json()
          if (data.success && data.data) {
            const status = data.data.status
            if (terminalRef.current) return
            setPayment((prev: any) => prev ? { ...prev, status } : prev)
            if (status === 'completed') {
              setShowConfetti(true)
              setTerminal(true)
              terminalRef.current = true
              clearInterval(interval)
            }
            if (['failed', 'cancelled', 'expired'].includes(status)) {
              setTerminal(true)
              terminalRef.current = true
              clearInterval(interval)
            }
          }
        }
      } catch {
        // Continue polling on error
      }
    }

    const startPolling = () => {
      pollStatus() // immediate first check
      interval = setInterval(pollStatus, 3000)
    }

    fetchInitial()
    return () => clearInterval(interval)
  }, [paymentId])

  // Countdown timer - exactly 15 minutes from creation
  useEffect(() => {
    if (!payment?.created_at || terminal) return
    // 15 minutes = 900 seconds from creation time
    const expiresAt = new Date(payment.created_at).getTime() + (15 * 60 * 1000)
    
    const tick = () => {
      if (terminalRef.current) return
      const diff = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
      setTimeLeft(diff)
      if (diff <= 0) {
        // Auto-expire — lock terminal so polling can't overwrite
        setTerminal(true)
        terminalRef.current = true
        setPayment((prev: any) => prev ? { ...prev, status: 'expired' } : prev)
      }
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [payment?.created_at, terminal])

  const minutes = Math.floor(timeLeft / 60)
  const seconds = timeLeft % 60

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const cancelPayment = async () => {
    setShowCancel(false)
    // Show cancelled state immediately and stop polling
    setTerminal(true)
    terminalRef.current = true
    setPayment((prev: any) => prev ? { ...prev, status: 'cancelled' } : prev)
    // Call API (fire-and-forget, UI already updated)
    fetch('/api/topup/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction_id: paymentId })
    }).catch(() => {})
  }

  // NOT FOUND / INVALID STATE
  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--deep-space, #0a0a0a)' }}>
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="max-w-md w-full rounded-2xl p-8 text-center"
          style={{ background: 'var(--surface-1, #111113)', border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))' }}>
          <div className="size-20 rounded-full mx-auto flex items-center justify-center" style={{ background: 'rgba(244,63,94,0.1)' }}>
            <XCircle className="size-10" style={{ color: 'var(--rose, #f43f5e)' }} />
          </div>
          <h1 className="text-2xl font-bold text-white mt-6">Invalid Payment</h1>
          <p className="mt-2" style={{ color: 'var(--text-secondary, #8a8b9e)' }}>This payment link is invalid or has been cancelled.</p>
        </motion.div>
      </div>
    )
  }

  if (!payment) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--deep-space)' }}>
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
          <div className="size-8 border-2 border-[var(--q-accent)] border-t-transparent rounded-full" />
        </motion.div>
      </div>
    )
  }

  // SUCCESS STATE
  if (payment.status === 'completed') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--deep-space, #0a0a0a)' }}>
        {showConfetti && <Confetti />}
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="max-w-md w-full rounded-2xl p-8 text-center"
          style={{ background: 'var(--surface-1, #111113)', border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))' }}>
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.2 }}>
            <div className="size-20 rounded-full mx-auto flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.1)' }}>
              <CheckCircle2 className="size-10" style={{ color: 'var(--green, #22c55e)' }} />
            </div>
          </motion.div>
          <h1 className="text-2xl font-bold text-white mt-6">Payment Successful!</h1>
          <p className="mt-2" style={{ color: 'var(--text-secondary, #8a8b9e)' }}>
            Rp {Number(payment.total_charge || payment.amount || 0).toLocaleString('id-ID')} has been added to your balance
          </p>
          <RedirectCountdown to="/dashboard/topup?success=true" seconds={5} />
        </motion.div>
      </div>
    )
  }

  // CANCELLED / FAILED STATE
  if (['failed', 'cancelled'].includes(payment.status)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--deep-space, #0a0a0a)' }}>
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="max-w-md w-full rounded-2xl p-8 text-center"
          style={{ background: 'var(--surface-1, #111113)', border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))' }}>
          <div className="size-20 rounded-full mx-auto flex items-center justify-center" style={{ background: 'rgba(244,63,94,0.1)' }}>
            <XCircle className="size-10" style={{ color: 'var(--rose, #f43f5e)' }} />
          </div>
          <h1 className="text-2xl font-bold text-white mt-6">Transaction Cancelled</h1>
          <p className="mt-2" style={{ color: 'var(--text-secondary, #8a8b9e)' }}>This transaction was cancelled</p>
          <RedirectCountdown to="/dashboard/topup" seconds={5} />
        </motion.div>
      </div>
    )
  }

  // EXPIRED STATE
  if (payment.status === 'expired') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--deep-space, #0a0a0a)' }}>
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="max-w-md w-full rounded-2xl p-8 text-center"
          style={{ background: 'var(--surface-1, #111113)', border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))' }}>
          <div className="size-20 rounded-full mx-auto flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.1)' }}>
            <Clock className="size-10" style={{ color: 'var(--amber, #f59e0b)' }} />
          </div>
          <h1 className="text-2xl font-bold text-white mt-6">Payment Expired</h1>
          <p className="mt-2" style={{ color: 'var(--text-secondary, #8a8b9e)' }}>This payment has expired</p>
          <RedirectCountdown to="/dashboard/topup" seconds={5} />
        </motion.div>
      </div>
    )
  }

  // PENDING STATE - Show QR
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--deep-space)' }}>
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full rounded-2xl p-6"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}
      >
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-lg font-bold text-white">Cobain</h1>
          <p className="text-[var(--text-muted)] text-xs mt-1">Scan to complete payment</p>
        </div>

        {/* QR Code with glow */}
        <div className="flex justify-center mb-6">
          <motion.div
            animate={{ boxShadow: ['0 0 20px var(--accent-glow)', '0 0 40px var(--accent-glow)', '0 0 20px var(--accent-glow)'] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="bg-white p-4 rounded-2xl"
          >
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR Code" className="w-56 h-56 sm:w-64 sm:h-64" />
            ) : (
              <div className="w-56 h-56 sm:w-64 sm:h-64 flex items-center justify-center">
                <div className="size-8 border-2 border-[var(--q-accent)] border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </motion.div>
        </div>

        {/* Amount - CLEAN, just total */}
        <div className="text-center mb-5">
          <div className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted, #55566a)' }}>
            Total harus dibayar
          </div>
          <div className="text-4xl font-bold text-white mt-2 tracking-tight">
            Rp {Number(payment.total_charge || payment.amount || 0).toLocaleString('id-ID')}
          </div>
          <div className="text-xs mt-2" style={{ color: 'var(--text-muted, #55566a)' }}>
            Sudah termasuk fee + kode unik
          </div>
        </div>

        {/* Timer */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <Clock className="size-4 text-[var(--amber)]" />
          <span className="text-sm font-mono tabular-nums" style={{ color: timeLeft < 60 ? 'var(--rose)' : 'var(--amber)' }}>
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </span>
          <div className="size-2 rounded-full animate-pulse" style={{ background: 'var(--q-accent)' }} />
          <span className="text-xs text-[var(--text-muted)]">Waiting for payment...</span>
        </div>

        {/* Share link */}
        <div className="rounded-xl p-3 flex items-center gap-2 mb-3" style={{ background: 'var(--surface-2)' }}>
          <input readOnly value={shareUrl} className="flex-1 bg-transparent text-xs text-[var(--text-muted)] truncate outline-none" />
          <motion.button whileTap={{ scale: 0.9 }} onClick={copyLink}
            className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer"
            style={{ background: copied ? 'var(--green)' : 'var(--q-accent)', color: '#000' }}
          >
            {copied ? <><Check className="size-3" /> Copied</> : <><Copy className="size-3" /> Copy</>}
          </motion.button>
        </div>

        {/* Cancel button - only show on the device that generated the QRIS (has session) */}
        {hasSession && (
          <button onClick={() => setShowCancel(true)}
            className="w-full py-2.5 rounded-xl text-sm text-[var(--text-muted)] hover:text-[var(--rose)] transition-colors cursor-pointer"
            style={{ background: 'var(--surface-2)' }}
          >
            Cancel Payment
          </button>
        )}

        {/* Cancel confirmation modal */}
        <AnimatePresence>
          {showCancel && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              style={{ background: 'rgba(0,0,0,0.7)' }}
            >
              <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
                className="max-w-sm w-full rounded-2xl p-6 text-center"
                style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)' }}
              >
                <AlertTriangle className="size-12 text-[var(--amber)] mx-auto" />
                <h3 className="text-lg font-bold text-white mt-4">Cancel Payment?</h3>
                <p className="text-sm text-[var(--text-secondary)] mt-2">This action cannot be undone. Your payment will be cancelled.</p>
                <div className="flex gap-3 mt-6">
                  <button onClick={() => setShowCancel(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium cursor-pointer" style={{ background: 'var(--surface-2)', color: 'var(--text-primary)' }}>
                    Keep Waiting
                  </button>
                  <button onClick={cancelPayment} className="flex-1 py-2.5 rounded-xl text-sm font-medium cursor-pointer" style={{ background: 'var(--rose)', color: '#fff' }}>
                    Yes, Cancel
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

// Simple CSS confetti component
function Confetti() {
  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {Array.from({ length: 50 }).map((_, i) => (
        <motion.div key={i}
          initial={{ y: -20, x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 400), opacity: 1, rotate: 0 }}
          animate={{ y: (typeof window !== 'undefined' ? window.innerHeight : 800) + 20, opacity: 0, rotate: Math.random() * 720 }}
          transition={{ duration: 2 + Math.random() * 2, delay: Math.random() * 0.5 }}
          className="absolute w-2 h-2 rounded-sm"
          style={{ background: ['var(--q-accent)', 'var(--accent-purple)', 'var(--green)', 'var(--amber)', 'var(--rose)'][i % 5] }}
        />
      ))}
    </div>
  )
}
